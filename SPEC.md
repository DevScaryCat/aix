# aix 문법 명세 (v0)

> aix는 **AI가 쓰고 기계가 검증하는** 백엔드 표현이다. 사람이 읽을 수는 있지만,
> 1차 사용자는 AI다. 이 문서는 사람이 문법을 이해하기 위한 참고서다.

한 줄 요약: **엔티티(데이터 모양)** 와 **라우트(노출할 동작)** 만 선언하면,
고정 런타임이 그걸 실제 CRUD API로 즉석 해석한다. 생성되는 코드는 없다.

---

## 1. 전체 구조

`.aix` 파일은 **한 줄에 한 선언**, `#` 뒤는 주석이다. 선언은 딱 두 종류:

```
E <이름> { <필드>, <필드>, ... }     # Entity  — 데이터 모양
R <엔티티> { <동작>, <동작>, ... }    # Route   — 노출할 CRUD 동작
```

예시 (블로그 백엔드 전체):

```
E user { name:str!, email:str! }
E post { title:str!<=200, body:str!, published:bool=false, author:ref:user, created:ts=now }
R post { list:mine, get, create, update:[title,body,published], delete, auth }
```

---

## 2. 엔티티 (E)

```
E <이름> { <필드>, <필드>, ... }
```

- `<이름>` — 영문/숫자/`_` (예: `user`, `post`, `order_item`)
- 필드는 쉼표로 구분.

### 필드 문법

```
<이름>:<타입>[:<참조대상>][!][*][<=<수>][=<기본값>]
```

순서가 **고정**돼 있다 (그래야 기계가 100% 파싱 가능). 왼쪽부터:

| 부분 | 의미 | 예 |
|---|---|---|
| `이름:타입` | 필드 이름과 타입 (필수) | `title:str` |
| `:참조대상` | `ref` 타입일 때 가리킬 엔티티 | `author:ref:user` |
| `!` | 필수값 (없으면 거부) | `title:str!` |
| `*` | **소유자** 표시 (ref에만) | `buyer:ref:user*` |
| `<=수` | 최대 길이(str)/최댓값(int) | `title:str<=200` |
| `=기본값` | 기본값 | `done:bool=false` |

### 타입

| 타입 | 뜻 | 기본값 예 |
|---|---|---|
| `str` | 문자열 | `=hello` |
| `int` | 정수 | `=0` |
| `bool` | 참/거짓 | `=true` / `=false` |
| `ts` | 타임스탬프 | `=now` (생성 시각 자동) |
| `ref` | 다른 엔티티 참조 | — (`ref:<엔티티>` 형태로 대상 필수) |

### 필드 예시

```
name:str!                 # 필수 문자열
title:str!<=200           # 필수, 최대 200자
price:int!                # 필수 정수
stock:int=0               # 정수, 기본값 0
done:bool=false           # 불리언, 기본 false
created:ts=now            # 생성 시각 자동 기록
author:ref:user           # user 엔티티 참조 (단일 ref면 자동으로 소유자)
buyer:ref:user*           # user 참조이면서 "소유자"로 명시
```

---

## 3. 라우트 (R)

```
R <엔티티> { <동작>, <동작>, ... }
```

`<엔티티>`는 이미 `E`로 정의돼 있어야 한다. 동작 목록:

| 동작 | HTTP | 의미 |
|---|---|---|
| `list` | `GET /<엔티티>` | 전체 목록 |
| `list:mine` | `GET /<엔티티>` | **내 것만** (소유자 = 로그인 유저) |
| `get` | `GET /<엔티티>/:id` | 하나 조회 |
| `create` | `POST /<엔티티>` | 생성 (소유자 자동 주입) |
| `update:[a,b]` | `PATCH /<엔티티>/:id` | **나열한 필드만** 수정 허용 |
| `delete` | `DELETE /<엔티티>/:id` | 삭제 |
| `auth` | — | 이 리소스는 **로그인 필요** |

### 라우트 예시

```
R post  { list:mine, get, create, update:[title,body], delete, auth }
R product { list, get, create, update:[name,price,stock], delete, auth }
R order { list:mine, get, create, delete, auth }   # 수정 불가
```

---

## 4. 런타임 동작 규칙

검증을 통과한 주문서를 런타임이 이렇게 해석한다:

- **인증** — `auth`가 있으면 `x-user-id` 헤더 없는 요청은 `401`.
- **소유자 자동 주입** — `create` 시 소유자 ref 필드는 로그인 유저로 자동 채움 (요청 본문에 없어도 됨).
- **소유자 결정** — `*` 표시된 ref가 있으면 그것, 없고 ref가 1개면 그것, 여러 개면 → 검증 오류(`AMBIGUOUS_OWNER`).
- **`list:mine`** — 소유자 == 현재 유저인 행만 반환.
- **검증** — `create`/`update` 시 필수값·타입·최댓값을 런타임이 강제 (`REQUIRED` / `BAD_TYPE` / `TOO_LONG` / `TOO_BIG`).
- **필드 잠금** — `update:[...]`에 없는 필드를 바꾸려 하면 `403 FIELD_LOCKED`.
- **기본값** — 본문에 없으면 `=` 기본값 적용 (`now`는 현재 시각 ISO 문자열).

---

## 5. 검증기 (심장)

`aix check <파일>` 이 주문서를 **기계가 100% 판정**한다. 통과하면 런타임 실행이
보장되고, 실패하면 **어디가 왜 틀렸는지** 구조화된 오류를 낸다 — 사람이 디버깅하지
않고 AI가 그걸 읽고 스스로 고친다.

### 검증 오류 코드

| 코드 | 잡는 것 |
|---|---|
| `DUP_FIELD` | 같은 엔티티에 중복 필드 이름 |
| `BAD_REF` | `ref:X` 인데 X 엔티티가 정의 안 됨 |
| `BAD_DEFAULT` | 기본값 타입이 필드 타입과 안 맞음 (`=now`는 `ts`에만) |
| `BAD_MAX` | `<=` 를 str/int 아닌 타입에 사용 |
| `BAD_OWNER` | `*` 를 ref 아닌 필드에 사용 |
| `MULTI_OWNER` | 한 엔티티에 `*` 소유자가 2개 이상 |
| `NO_ENTITY` | 라우트가 정의 안 된 엔티티를 가리킴 |
| `BAD_UPDATE` | `update:[X]` 의 X가 실제 필드가 아님 |
| `NO_OWNER` | `list:mine` 인데 ref 필드가 하나도 없음 |
| `AMBIGUOUS_OWNER` | `list:mine` 인데 ref가 여러 개고 `*` 표시 없음 |
| `MINE_NO_AUTH` | `list:mine` 인데 `auth` 없음 ("나"를 알 수 없음) |

### 일부러 틀린 예시 (`examples/broken.aix`)

```
E post { title:str!<=200, author:ref:user, created:ts=now }
R post { list:mine, get, create, update:[titel], delete }
```

`aix check` 결과 — 사람이 아니라 기계가 버그 3개를 잡아냄:

```json
{ "code": "BAD_REF",      "where": "post.author", "message": "ref target \"user\" is not a defined entity" }
{ "code": "BAD_UPDATE",   "where": "R post",      "message": "update field \"titel\" is not a field of post" }
{ "code": "MINE_NO_AUTH", "where": "R post",      "message": "list:mine needs \"auth\" — without login there is no \"me\"" }
```

---

## 6. 전체 문법 (BNF 요약)

```
file    ::= line*
line    ::= ('#' comment) | entity | route | blank
entity  ::= 'E' name '{' field (',' field)* '}'
route   ::= 'R' name '{' op (',' op)* '}'

field   ::= name ':' type (':' name)? '!'? '*'? ('<=' int)? ('=' default)?
type    ::= 'str' | 'int' | 'bool' | 'ts' | 'ref'
default ::= 'now' | 'true' | 'false' | int | string

op      ::= 'list' | 'list:mine' | 'get' | 'create'
          | 'update:[' name (',' name)* ']' | 'delete' | 'auth'
```

---

## 7. 아직 없는 것 (로드맵)

v0는 단일 소유자 CRUD까지다. 다음 후보:

- 관계 조회(조인), 필터, 페이지네이션
- 영구 저장소(SQLite/Postgres) — 주문서는 그대로, 런타임만 교체
- 권한 규칙 확장 (역할 기반, 공유)
- 기존 코드 → aix 변환기 (학습 데이터 부트스트랩)
