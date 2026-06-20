import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDocs } from "../content";
import { CodeBlock } from "@/components/code-block";

const PARTS = ["name:type", ":ref", "!", "*", "~", "<=n", "=default"] as const;
const TYPES = ["str", "int", "bool", "ts", "ref", "enum[a|b|c]"] as const;
const SHORT = ["author>user", "created@", "email:str!~"] as const;

const TH = "border border-ink px-2 py-1 text-left font-ui text-[11px] font-bold uppercase tracking-wide";
const TDC = "border border-ink px-2 py-1 font-mono text-[12px] whitespace-nowrap align-top";
const TDT = "border border-ink px-2 py-1 font-body text-[13px] align-top";

export default async function Entities({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const d = (await getDocs(locale)).entities;

  return (
    <article className="space-y-4">
      <h1 className="font-display text-[30px] leading-none text-ink sm:text-[38px]">{d.title}</h1>
      <p className="font-body text-[14px] leading-[1.55] text-ink">{d.lead}</p>
      <CodeBlock title="field" code={d.grammar} />

      <h2 className="pt-2 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">{d.partsTitle}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="bg-sage"><th className={TH}>{d.colPart}</th><th className={TH}>{d.colMeaning}</th></tr></thead>
          <tbody className="bg-canvas">
            {PARTS.map((k) => (<tr key={k}><td className={TDC}>{k}</td><td className={TDT}>{d.parts[k]}</td></tr>))}
          </tbody>
        </table>
      </div>

      <h2 className="pt-2 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">{d.typesTitle}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="bg-lime"><th className={TH}>{d.colType}</th><th className={TH}>{d.colMeaning}</th></tr></thead>
          <tbody className="bg-canvas">
            {TYPES.map((k) => (<tr key={k}><td className={TDC}>{k}</td><td className={TDT}>{d.types[k]}</td></tr>))}
          </tbody>
        </table>
      </div>

      <h2 className="pt-2 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">{d.shorthandTitle}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="bg-peach"><th className={TH}>{d.colShort}</th><th className={TH}>{d.colLong}</th></tr></thead>
          <tbody className="bg-canvas">
            {SHORT.map((k) => (<tr key={k}><td className={TDC}>{k}</td><td className={TDC}>{d.shorthand[k]}</td></tr>))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
