# aix 문법 명세 (v0.1)

> aix는 **AI가 쓰고 기계가 검증하는** 백엔드 표현이다. 사람이 읽을 수는 있지만,
> 1차 사용자는 AI다. 이 문서는 사람이 문법을 이해하기 위한 참고서다.

한 줄 요약: **엔티티(데이터 모양)** 와 **라우트(노출할 동작)** 만 선언하면,
고정 런타임이 그걸 실제 CRUD API로 즉석 해석한다. 생성되는 코드는 없다.

**v0.1에서 추가된 것**: 참조 무결성·유니크(`~`)·enum 타입·필터/정렬/페이지네이션,
소유자 권한 스코프(`private`, `list:mine`이 자동 함의), 그리고 토큰을 줄이는 짧은
문법(중괄호 생략, `>` ref, `@` 생성시각). **기존 v0 문법은 그대로 동작한다(하위호환).**

---

## 1. 전체 구조

`.aix` 파일은 **한 줄에 한 선언**, `#` 뒤는 주석이다. 중괄호는 **선택**이다.

```
E <이름> <필드>, <필드>, ...      # Entity — 데이터 모양  (E <이름> { ... } 도 가능)
R <엔티티> <동작>, <동작>, ...    # Route  — 노출할 CRUD 동작
```

예시 (블로그 백엔드 전체):

```
E user name:str!, email:str!~
E post title:str!<=200, body:str!, published:bool=false, author>user, created@
R post list:mine, get, create, update:[title,body,published], delete
```

---

## 2. 엔티티 (E)

필드는 쉼표로 구분. 각 필드는 **고정된 순서**를 따라야 기계가 100% 결정론적으로 파싱한다:

```
<이름>:<타입>[:<참조>][!][*][~][<=<수>][=<기본값>]
```

| 부분 | 의미 | 예 |
|---|---|---|
| `이름:타입` | 필드 이름과 타입 (필수) | `title:str` |
| `:참조` | `ref` 타입일 때 가리킬 엔티티 | `author:ref:user` |
| `!` | 필수값 (없으면 거부) | `title:str!` |
| `*` | **소유자** 표시 (ref에만) | `buyer:ref:user*` |
| `~` | **유니크** (str/int에만) | `email:str!~` |
| `<=수` | 최대 길이(str)/최댓값(int) | `title:str<=200` |
| `=기본값` | 기본값 | `done:bool=false` |

### 짧은 문법 (token 절약, v0.1)

| 짧게 | 풀어쓰면 | 뜻 |
|---|---|---|
| `author>user` | `author:ref:user` | `>` 는 ref |
| `buyer>user*` | `buyer:ref:user*` | ref + 소유자 |
| `created@` | `created:ts=now` | `@` 는 생성시각 자동 |

### 타입

| 타입 | 뜻 | 기본값 예 |
|---|---|---|
| `str` | 문자열 | `=hello` |
| `int` | 정수 | `=0` |
| `bool` | 참/거짓 | `=true` / `=false` |
| `ts` | 타임스탬프 | `=now` (생성 시각 자동) / `이름@` |
| `ref` | 다른 엔티티 참조 | `ref:<엔티티>` 또는 `>` |
| `enum[a\|b\|c]` | 닫힌 값 집합 | `status:enum[draft\|published]=draft` |

---

## 3. 라우트 (R)

```
R <엔티티> <동작>, <동작>, ...
```

| 동작 | HTTP | 의미 |
|---|---|---|
| `list` | `GET /<엔티티>` | 전체 목록 |
| `list:mine` | `GET /<엔티티>` | **내 것만** (소유자 = 로그인 유저) |
| `get` | `GET /<엔티티>/:id` | 하나 조회 |
| `create` | `POST /<엔티티>` | 생성 (소유자 자동 주입) |
| `update:[a,b]` | `PATCH /<엔티티>/:id` | **나열한 필드만** 수정 허용 |
| `delete` | `DELETE /<엔티티>/:id` | 삭제 |
| `auth` | — | 로그인 필요 |
| `private` | — | 단건 조회/수정/삭제를 **소유자만** (남의 행은 404) |
| `filter:[a,b]` | `?a=..&b=..` | 나열한 필드 **동등 비교** 필터 |
| `sort:f` / `sort:f:desc` | `GET` | 정렬 (기본 오름차순) |
| `page` | `?limit=&offset=` | 페이지네이션 (limit 최대 200) |

### 자동 함의 (v0.1)

- **`list:mine` → `auth` + `private` 자동.** 내 것만 보여주려면 로그인이 전제이고,
  단건 조회/수정/삭제도 소유자로 한정된다. 즉 `list:mine`만 써도 인가가 닫힌다.
  (`auth` 토큰을 따로 안 써도 됨 — 까먹어서 생기는 버그가 사라진다.)

---

## 4. 런타임 동작 규칙

검증을 통과한 주문서를 런타임이 이렇게 해석한다:

- **인증** — `auth`가 있으면 `x-user-id` 헤더 없는 요청은 `401`.
- **소유자 자동 주입(강화)** — `create` 시 소유자 ref는 **항상 로그인 유저로 강제**된다
  (본문에 다른 소유자를 넣어도 무시 — 소유권 위조 불가).
- **소유자 결정** — `*` 표시된 ref, 없고 ref가 1개면 그것, 여러 개면 검증 오류(`AMBIGUOUS_OWNER`).
- **`list:mine`** — 소유자 == 현재 유저인 행만 반환.
- **`private`** — `get`/`update`/`delete`에서 소유자가 아니면 `404`(존재 노출 방지).
- **참조 무결성** — 소유자가 아닌 `ref` 값은 **실제 존재하는 행**을 가리켜야 한다
  (없으면 `400 BAD_REF_ROW`, 숫자 아님은 `400 BAD_REF`).
- **검증** — `create`/`update` 시 필수·타입·최댓값·enum 멤버십을 강제
  (`REQUIRED`/`BAD_TYPE`/`TOO_LONG`/`TOO_BIG`/`BAD_ENUM`).
- **유니크** — `~` 필드는 중복 시 `409 CONFLICT`.
- **필드 잠금** — `update:[...]`에 없는 필드를 바꾸려 하면 `403 FIELD_LOCKED`.
- **기본값** — 본문에 없으면 `=` 기본값 적용 (`now`/`@`는 현재 시각 ISO).
- **목록 쿼리** — `filter`(동등 비교, 선언된 필드만) → `sort` → `page` 순으로 적용.

---

## 5. 검증기 (심장)

`aix check <파일>` 이 주문서를 **기계가 100% 판정**한다. 통과하면 런타임 실행이
보장되고, 실패하면 **어디가 왜 틀렸는지** 구조화된 오류를 낸다. v0.1부터 오타는
편집거리 기반으로 **"did you mean ...?"** 후보까지 제시한다.

| 코드 | 잡는 것 |
|---|---|
| `DUP_FIELD` | 같은 엔티티에 중복 필드 이름 |
| `BAD_REF` | `ref:X` 인데 X 엔티티가 정의 안 됨 (+ 후보 제시) |
| `EMPTY_ENUM` | `enum[]` 에 값이 하나도 없음 |
| `BAD_DEFAULT` | 기본값 타입이 안 맞음 (`=now`는 ts에만, enum 기본값은 멤버여야 함) |
| `BAD_MAX` | `<=` 를 str/int 아닌 타입에 사용 |
| `BAD_OWNER` | `*` 를 ref 아닌 필드에 사용 |
| `BAD_UNIQUE` | `~` 를 str/int 아닌 타입에 사용 |
| `MULTI_OWNER` | 한 엔티티에 `*` 소유자가 2개 이상 |
| `NO_ENTITY` | 라우트가 정의 안 된 엔티티를 가리킴 (+ 후보 제시) |
| `BAD_UPDATE` | `update:[X]` 의 X가 실제 필드가 아님 (+ 후보 제시) |
| `FILTER_FIELD` | `filter:[X]` 의 X가 실제 필드가 아님 (+ 후보 제시) |
| `SORT_FIELD` | `sort:X` 가 실제 필드가 아니거나 str/int/ts가 아님 |
| `NO_OWNER` | `list:mine`/`private` 인데 ref 필드가 하나도 없음 |
| `AMBIGUOUS_OWNER` | `list:mine`/`private` 인데 ref가 여러 개고 `*` 표시 없음 |

> v0의 `MINE_NO_AUTH`는 사라졌다 — `list:mine`이 `auth`를 자동 함의하므로 더는 오류가 아니다.

---

## 6. 전체 문법 (BNF 요약)

```
file    ::= line*
line    ::= ('#' comment) | entity | route | blank
entity  ::= 'E' name body
route   ::= 'R' name body
body    ::= '{' items '}' | items                       # 중괄호 선택

field   ::= name ':' type (':' name)? '!'? '*'? '~'? ('<=' int)? ('=' default)?
          | name '>' name '!'? '*'?                      # ref 단축
          | name '@'                                     # ts=now 단축
          | name ':enum[' value ('|' value)* ']' '!'? ('=' value)?
type    ::= 'str' | 'int' | 'bool' | 'ts' | 'ref'
default ::= 'now' | 'true' | 'false' | int | string

op      ::= 'list' | 'list:mine' | 'get' | 'create'
          | 'update:[' name (',' name)* ']' | 'delete' | 'auth'
          | 'private' | 'filter:[' name (',' name)* ']'
          | 'sort:' name (':' ('asc'|'desc'))? | 'page'
```

---

## 7. 설계 불변식 (진화 시 반드시 보존)

1. **결정론적·전체 검증** — 검증기는 닫힌 심볼 테이블 위의 유한 1차 술어만. LLM/휴리스틱/무한 루프 없음. 통과 = 실행 보장.
2. **닫힌 문법** — 추가는 고정 enum이나 대괄호 리스트만. 식/정규식/WHERE 언어 불가(결정 가능성 유지).
3. **코드 생성 0** — 고정 인터프리터가 AST를 해석. 훅/인라인 식 없음.
4. **검증/런타임 락스텝** — 런타임이 역참조하는 심볼은 검증기가 먼저 확인. 공유 `ownerOf`(src/owner.mjs).

## 8. 아직 없는 것 (로드맵)

- ref 펼치기(`expand:[author]`, 1-hop 조인), 비차단 경고 채널
- 영구 저장소(SQLite/Postgres) — 주문서는 그대로, 런타임만 교체
- 역할 기반 권한·공유, 교차 레코드 제약(닫힌 구성으로만)
