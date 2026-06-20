import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDocs } from "../content";

const OPS: { key: string; http: string }[] = [
  { key: "list", http: "GET /<e>" },
  { key: "list:mine", http: "GET /<e>" },
  { key: "get", http: "GET /<e>/:id" },
  { key: "create", http: "POST /<e>" },
  { key: "update:[a,b]", http: "PATCH /<e>/:id" },
  { key: "delete", http: "DELETE /<e>/:id" },
  { key: "auth", http: "—" },
  { key: "private", http: "—" },
  { key: "filter:[a,b]", http: "GET ?a=" },
  { key: "sort:f / sort:f:desc", http: "GET ?" },
  { key: "page", http: "GET ?limit=&offset=" },
];

const TH = "border border-ink px-2 py-1 text-left font-ui text-[11px] font-bold uppercase tracking-wide";
const TDC = "border border-ink px-2 py-1 font-mono text-[12px] whitespace-nowrap align-top";
const TDT = "border border-ink px-2 py-1 font-body text-[13px] align-top";

export default async function Routes({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const d = (await getDocs(locale)).routes;
  const ops = d.ops as Record<string, string>;

  return (
    <article className="space-y-4">
      <h1 className="font-display text-[30px] leading-none text-ink sm:text-[38px]">{d.title}</h1>
      <p className="font-body text-[14px] leading-[1.55] text-ink">{d.lead}</p>
      <div className="overflow-x-auto">
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
                <td className={TDC}>{op.key}</td>
                <td className={TDC}>{op.http}</td>
                <td className={TDT}>{ops[op.key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border border-ink bg-sky/40 px-4 py-3">
        <p className="font-ui text-[12px] font-bold uppercase tracking-wide text-ink">{d.inferTitle}</p>
        <p className="mt-1 font-body text-[14px] leading-[1.5] text-ink">{d.infer}</p>
      </div>
    </article>
  );
}
