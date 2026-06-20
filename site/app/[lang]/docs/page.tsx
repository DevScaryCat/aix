import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { getDocs } from "./content";
import { CodeBlock } from "@/components/code-block";

const EXAMPLE = `E user name:str!, email:str!~
E post title:str!<=200, body:str!, author>user, created@
R post list:mine, get, create, update:[title,body], delete`;

export default async function DocsOverview({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const d = (await getDocs(locale)).overview;

  return (
    <article className="space-y-4">
      <h1 className="font-display text-[34px] leading-none text-ink sm:text-[44px]">{d.title}</h1>
      <p className="font-body text-[15px] leading-[1.55] text-ink">{d.lead}</p>
      <p className="font-body text-[14px] leading-[1.55] text-ink">{d.twoKinds}</p>
      <CodeBlock
        code={`E <name> <field>, ...     # ${d.entityComment}\nR <entity> <op>, ...      # ${d.routeComment}`}
      />
      <CodeBlock title="example" code={EXAMPLE} />
      <p className="font-body text-[14px] leading-[1.55] text-ink">{d.next}</p>
    </article>
  );
}
