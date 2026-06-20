import Link from "next/link";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";
import { SectionTitle } from "@/components/section-title";
import { RibbonCard } from "@/components/ribbon-card";
import { CodeBlock } from "@/components/code-block";
import { BarChart } from "@/components/bar-chart";
import { Sticker } from "@/components/sticker";
import { GITHUB_URL } from "@/components/banner";

// ── Language-neutral content (code + exact numbers from README/SPEC) ──
const BLOG_SPEC = `E user { name:str!, email:str! }
E post { title:str!<=200, body:str!, published:bool=false, author:ref:user, created:ts=now }
R post { list:mine, get, create, update:[title,body,published], delete, auth }`;

const CLONE_CMD = `git clone https://github.com/DevScaryCat/aix
cd aix`;
const CHECK_CMD = `node src/cli.mjs check examples/blog.aix`;
const RUN_CMD = `node src/cli.mjs run examples/blog.aix`;

const BROKEN_SPEC = `E post { title:str!<=200, author:ref:user, created:ts=now }
R post { list:mine, get, create, update:[titel], delete }`;

const VERIFIER_ERRORS = `{ "code": "BAD_REF",      "where": "post.author", "message": "ref target \\"user\\" is not a defined entity" }
{ "code": "BAD_UPDATE",   "where": "R post",      "message": "update field \\"titel\\" is not a field of post" }
{ "code": "MINE_NO_AUTH", "where": "R post",      "message": "list:mine needs \\"auth\\" — without login there is no \\"me\\"" }`;

const CURL_NOLOGIN = `curl -X POST localhost:8787/post -d '{"title":"hi","body":"x"}'`;
const CURL_LOGIN = `curl -X POST localhost:8787/post -H 'x-user-id: chris' \\
     -d '{"title":"first post","body":"hello"}'
# → 201 {"id":1, ..., "author":"chris", "created":"..."}`;
const CURL_MINE = `curl localhost:8787/post -H 'x-user-id: chris'`;
const CURL_LOCK = `curl -X PATCH localhost:8787/post/1 -H 'x-user-id: chris' \\
     -d '{"author":"hacker"}'
# → 403 FIELD_LOCKED`;

const SCENARIOS = [
  { name: "todo", tokN: 876, tokA: 42, tokR: "20.9×", linN: 84, linA: 3, linR: "28.0×", filN: 5, filA: 1 },
  { name: "blog", tokN: 904, tokA: 51, tokR: "17.7×", linN: 88, linA: 3, linR: "29.3×", filN: 5, filA: 1 },
  { name: "shop", tokN: 1472, tokA: 79, tokR: "18.6×", linN: 140, linA: 5, linR: "28.0×", filN: 7, filA: 1 },
];

const BTN_PRIMARY =
  "inline-block border border-ink bg-ink px-4 py-2 font-ui text-[12px] font-bold uppercase tracking-wide text-canvas hover:bg-ink/85";
const BTN_SECONDARY =
  "inline-block border border-ink bg-canvas px-4 py-2 font-ui text-[12px] font-bold uppercase tracking-wide text-ink hover:bg-sky/40";

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const dict = await getDictionary(locale);
  const t = dict;

  return (
    <>
      {/* ── Hero ── */}
      <section className="mx-auto max-w-3xl px-4 pt-8 pb-6 sm:pt-12">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-[64px] leading-[0.82] text-ink sm:text-[104px]">
            aix
          </h1>
          <Sticker rotate className="mt-3">
            {t.hero.sticker}
          </Sticker>
        </div>
        <p className="mt-3 font-ui text-[16px] font-bold uppercase tracking-wide text-ink sm:text-[20px]">
          {t.hero.tagline}
        </p>

        {/* cta-block-red: the goal, in white Times on Dell red */}
        <div className="mt-5 border border-ink bg-primary px-4 py-4">
          <p className="font-body text-[15px] leading-[1.5] text-canvas sm:text-[16px]">
            {t.hero.lead}
          </p>
        </div>

        <p className="mt-4 font-body text-[14px] leading-[1.55] text-ink">
          {t.hero.sub}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/${locale}/docs`} className={BTN_PRIMARY}>
            {t.hero.ctaDocs}
          </Link>
          <a href={GITHUB_URL} className={BTN_SECONDARY}>
            {t.hero.ctaGithub}
          </a>
        </div>
      </section>

      {/* ── Pipeline ── */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <SectionTitle tint="olive">{t.pipeline.title}</SectionTitle>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RibbonCard title={t.pipeline.nl} tint="lime" badge="1">
            {t.pipeline.nlNote}
          </RibbonCard>
          <RibbonCard title={t.pipeline.spec} tint="sage" badge="2">
            {t.pipeline.specNote}
          </RibbonCard>
          <RibbonCard title={t.pipeline.verify} tint="periwinkle" badge="3">
            {t.pipeline.verifyNote}
          </RibbonCard>
          <RibbonCard title={t.pipeline.runtime} tint="sky" badge="4">
            {t.pipeline.runtimeNote}
          </RibbonCard>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 font-mono text-[12px]">
          <span className="border border-ink bg-canvas px-2 py-1 text-ink">
            ✗ {t.pipeline.rejected}
          </span>
          <span className="border border-ink bg-canvas px-2 py-1 text-ink">
            ✓ {t.pipeline.accepted}
          </span>
        </div>
      </section>

      {/* ── A whole blog backend ── */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <SectionTitle tint="sage">{t.blog.title}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">
          {t.blog.lead}
        </p>
        <div className="mt-4">
          <CodeBlock title="aix" code={BLOG_SPEC} caption={t.blog.caption} />
        </div>
      </section>

      {/* ── Performance ── */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <SectionTitle tint="salmon">{t.perf.title}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">
          {t.perf.subtitle}
        </p>

        <p className="mt-5 mb-2 font-ui text-[11px] font-bold uppercase tracking-wide text-ink/70">
          {t.perf.lowerBetter}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <BarChart
            label={t.perf.tokensTitle}
            nextValue={3252}
            aixValue={172}
            ratio={`18.9× ${t.perf.fewer}`}
          />
          <BarChart
            label={t.perf.linesTitle}
            nextValue={312}
            aixValue={11}
            ratio={`28.4× ${t.perf.fewer}`}
          />
        </div>

        {/* Per-scenario exact table */}
        <h3 className="mt-6 mb-2 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">
          {t.perf.tableTitle}
        </h3>
        <div className="overflow-x-auto border border-ink">
          <table className="w-full border-collapse font-mono text-[12px]">
            <thead>
              <tr className="bg-peach text-ink">
                <th rowSpan={2} className="border border-ink px-2 py-1 text-left font-ui font-bold uppercase">
                  {t.perf.colScenario}
                </th>
                <th colSpan={3} className="border border-ink px-2 py-1 font-ui font-bold uppercase">
                  {t.perf.metricTokens}
                </th>
                <th colSpan={3} className="border border-ink px-2 py-1 font-ui font-bold uppercase">
                  {t.perf.metricLines}
                </th>
                <th rowSpan={2} className="border border-ink px-2 py-1 font-ui font-bold uppercase">
                  {t.perf.metricFiles}
                </th>
              </tr>
              <tr className="bg-peach/60 text-ink">
                <th className="border border-ink px-2 py-1 font-ui">Next.js</th>
                <th className="border border-ink px-2 py-1 font-ui">aix</th>
                <th className="border border-ink px-2 py-1 font-ui">{t.perf.colRatio}</th>
                <th className="border border-ink px-2 py-1 font-ui">Next.js</th>
                <th className="border border-ink px-2 py-1 font-ui">aix</th>
                <th className="border border-ink px-2 py-1 font-ui">{t.perf.colRatio}</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIOS.map((s) => (
                <tr key={s.name} className="bg-canvas text-ink">
                  <td className="border border-ink px-2 py-1 font-ui font-bold uppercase">{s.name}</td>
                  <td className="border border-ink px-2 py-1 text-right">{s.tokN}</td>
                  <td className="border border-ink px-2 py-1 text-right">{s.tokA}</td>
                  <td className="border border-ink px-2 py-1 text-right">{s.tokR}</td>
                  <td className="border border-ink px-2 py-1 text-right">{s.linN}</td>
                  <td className="border border-ink px-2 py-1 text-right">{s.linA}</td>
                  <td className="border border-ink px-2 py-1 text-right">{s.linR}</td>
                  <td className="border border-ink px-2 py-1 text-right">
                    {s.filN} → {s.filA}
                  </td>
                </tr>
              ))}
              <tr className="bg-yellow text-ink font-bold">
                <td className="border border-ink px-2 py-1 font-ui uppercase">Σ</td>
                <td className="border border-ink px-2 py-1 text-right">3252</td>
                <td className="border border-ink px-2 py-1 text-right">172</td>
                <td className="border border-ink px-2 py-1 text-right">18.9×</td>
                <td className="border border-ink px-2 py-1 text-right">312</td>
                <td className="border border-ink px-2 py-1 text-right">11</td>
                <td className="border border-ink px-2 py-1 text-right">28.4×</td>
                <td className="border border-ink px-2 py-1 text-right">17 → 3</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Honesty notes */}
        <div className="mt-5 border border-ink bg-steel/40 px-4 py-3">
          <p className="font-ui text-[12px] font-bold uppercase tracking-wide text-ink">
            {t.perf.honestyTitle}
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 font-body text-[13px] leading-[1.5] text-ink">
            {t.perf.honesty.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Verifier demo ── */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <SectionTitle tint="periwinkle">{t.verifier.title}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">
          {t.verifier.lead}
        </p>
        <div className="mt-4 grid gap-3">
          <CodeBlock title="aix · 3 bugs" code={BROKEN_SPEC} caption={t.verifier.caption} />
          <CodeBlock title={t.verifier.errorsCaption} code={VERIFIER_ERRORS} />
        </div>
      </section>

      {/* ── Usage ── */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <SectionTitle tint="sky">{t.usage.title}</SectionTitle>
        <p className="mt-5 font-body text-[14px] text-ink">{t.usage.requires}</p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 font-ui text-[12px] font-bold uppercase tracking-wide text-ink">
              {t.usage.clone}
            </p>
            <CodeBlock code={CLONE_CMD} />
          </div>
          <div>
            <p className="mb-2 font-ui text-[12px] font-bold uppercase tracking-wide text-ink">
              1 · {t.usage.step1}
            </p>
            <CodeBlock code={`${CHECK_CMD}\n${t.usage.step1Out}`} />
          </div>
          <div>
            <p className="mb-2 font-ui text-[12px] font-bold uppercase tracking-wide text-ink">
              2 · {t.usage.step2}
            </p>
            <CodeBlock code={RUN_CMD} />
          </div>
        </div>

        <h3 className="mt-6 mb-2 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">
          {t.usage.liveTitle}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <CodeBlock title={t.usage.curl1} code={CURL_NOLOGIN} />
          <CodeBlock title={t.usage.curl2} code={CURL_LOGIN} />
          <CodeBlock title={t.usage.curl3} code={CURL_MINE} />
          <CodeBlock title={t.usage.curl4} code={CURL_LOCK} />
        </div>
      </section>
    </>
  );
}
