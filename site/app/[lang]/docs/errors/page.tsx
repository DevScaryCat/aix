import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDocs } from "../content";

const CODES = [
  "DUP_FIELD", "BAD_REF", "EMPTY_ENUM", "BAD_DEFAULT", "BAD_MAX", "BAD_OWNER", "BAD_UNIQUE",
  "MULTI_OWNER", "NO_ENTITY", "BAD_UPDATE", "OWNER_LOCKED", "PRIVATE_LIST", "OWNER_CREATE_NO_AUTH",
  "FILTER_FIELD", "SORT_FIELD", "NO_OWNER", "AMBIGUOUS_OWNER",
] as const;

const TH = "border border-ink px-2 py-1 text-left font-ui text-[11px] font-bold uppercase tracking-wide";
const TDC = "border border-ink px-2 py-1 font-mono text-[12px] whitespace-nowrap align-top";
const TDT = "border border-ink px-2 py-1 font-body text-[13px] align-top";

export default async function Errors({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const d = (await getDocs(locale)).errors;

  return (
    <article className="space-y-4">
      <h1 className="font-display text-[30px] leading-none text-ink sm:text-[38px]">{d.title}</h1>
      <p className="font-body text-[14px] leading-[1.55] text-ink">{d.lead}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="bg-salmon"><th className={TH}>{d.colCode}</th><th className={TH}>{d.colCatches}</th></tr></thead>
          <tbody className="bg-canvas">
            {CODES.map((c) => (<tr key={c}><td className={TDC}>{c}</td><td className={TDT}>{d.codes[c]}</td></tr>))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
