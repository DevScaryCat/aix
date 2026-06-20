import Link from "next/link";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";
import { SectionTitle } from "@/components/section-title";
import { CodeBlock } from "@/components/code-block";

// Neutral identifiers; meanings come from the dictionary, keyed by these.
const PARTS = ["name:type", ":ref", "!", "*", "<=n", "=default"] as const;
const TYPES = ["str", "int", "bool", "ts", "ref"] as const;
const OPS = [
  { key: "list", syntax: "list", http: "GET /<e>" },
  { key: "list:mine", syntax: "list:mine", http: "GET /<e>" },
  { key: "get", syntax: "get", http: "GET /<e>/:id" },
  { key: "create", syntax: "create", http: "POST /<e>" },
  { key: "update", syntax: "update:[a,b]", http: "PATCH /<e>/:id" },
  { key: "delete", syntax: "delete", http: "DELETE /<e>/:id" },
  { key: "auth", syntax: "auth", http: "—" },
] as const;
const ERROR_CODES = [
  "DUP_FIELD",
  "BAD_REF",
  "BAD_DEFAULT",
  "BAD_MAX",
  "BAD_OWNER",
  "MULTI_OWNER",
  "NO_ENTITY",
  "BAD_UPDATE",
  "NO_OWNER",
  "AMBIGUOUS_OWNER",
  "MINE_NO_AUTH",
] as const;

const TH = "border border-ink px-2 py-1 text-left font-ui text-[11px] font-bold uppercase tracking-wide";
const TD_CODE = "border border-ink px-2 py-1 font-mono text-[12px] whitespace-nowrap align-top";
const TD_TEXT = "border border-ink px-2 py-1 font-body text-[13px] align-top";

export default async function DocsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const d = (await getDictionary(locale)).docs;

  const structureCode = `E <name> { <field>, <field>, ... }    # ${d.entityComment}
R <entity> { <op>, <op>, ... }       # ${d.routeComment}`;

  return (
    <>
      <section className="mx-auto max-w-3xl px-4 pt-8 pb-4">
        <Link
          href={`/${locale}`}
          className="prose-link font-ui text-[12px] font-bold uppercase"
        >
          {d.backHome}
        </Link>
        <h1 className="mt-3 font-display text-[40px] leading-none text-ink sm:text-[56px]">
          {d.title}
        </h1>
        <p className="mt-3 font-body text-[14px] leading-[1.55] text-ink">
          {d.subtitle}
        </p>
      </section>

      {/* 1. Structure */}
      <section className="mx-auto max-w-3xl px-4 py-6">
        <SectionTitle tint="olive">{d.structureTitle}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">{d.structureBody}</p>
        <div className="mt-4">
          <CodeBlock code={structureCode} />
        </div>
      </section>

      {/* 2. Entities */}
      <section className="mx-auto max-w-3xl px-4 py-6">
        <SectionTitle tint="sage">{d.entityTitle}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">{d.entityBody}</p>
        <div className="mt-4">
          <CodeBlock title="field" code={d.fieldGrammar} />
        </div>

        <h3 className="mt-6 mb-2 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">
          {d.partsTitle}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-sage">
                <th className={TH}>{d.colPart}</th>
                <th className={TH}>{d.colMeaning}</th>
              </tr>
            </thead>
            <tbody className="bg-canvas">
              {PARTS.map((p) => (
                <tr key={p}>
                  <td className={TD_CODE}>{p}</td>
                  <td className={TD_TEXT}>{d.parts[p]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 mb-2 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">
          {d.typesTitle}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-sage">
                <th className={TH}>{d.colType}</th>
                <th className={TH}>{d.colMeaning}</th>
              </tr>
            </thead>
            <tbody className="bg-canvas">
              {TYPES.map((ty) => (
                <tr key={ty}>
                  <td className={TD_CODE}>{ty}</td>
                  <td className={TD_TEXT}>{d.types[ty]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Routes */}
      <section className="mx-auto max-w-3xl px-4 py-6">
        <SectionTitle tint="periwinkle">{d.routesTitle}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">{d.routesBody}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-periwinkle">
                <th className={TH}>{d.colOp}</th>
                <th className={TH}>{d.colHttp}</th>
                <th className={TH}>{d.colMeaning}</th>
              </tr>
            </thead>
            <tbody className="bg-canvas">
              {OPS.map((op) => (
                <tr key={op.key}>
                  <td className={TD_CODE}>{op.syntax}</td>
                  <td className={TD_CODE}>{op.http}</td>
                  <td className={TD_TEXT}>{d.ops[op.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Runtime rules */}
      <section className="mx-auto max-w-3xl px-4 py-6">
        <SectionTitle tint="lime">{d.runtimeTitle}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">{d.runtimeBody}</p>
        <ol className="mt-4 list-decimal space-y-2 border border-ink bg-canvas py-3 pl-8 pr-4 font-body text-[14px] leading-[1.5] text-ink">
          {d.runtimeRules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
      </section>

      {/* 5. Verifier error codes */}
      <section className="mx-auto max-w-3xl px-4 py-6 pb-10">
        <SectionTitle tint="salmon">{d.errorsTitle}</SectionTitle>
        <p className="mt-5 font-body text-[14px] leading-[1.55] text-ink">{d.errorsBody}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-salmon">
                <th className={TH}>{d.colCode}</th>
                <th className={TH}>{d.colCatches}</th>
              </tr>
            </thead>
            <tbody className="bg-canvas">
              {ERROR_CODES.map((code) => (
                <tr key={code}>
                  <td className={TD_CODE}>{code}</td>
                  <td className={TD_TEXT}>{d.errors[code]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
