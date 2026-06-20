// The brand's signature component: a white Helvetica-bold title bar with a hard
// black underline, over a flat catalog-tint body holding Times-Roman copy.
import type { Tint } from "./section-title";

const TINT_BG: Record<Tint, string> = {
  olive: "bg-olive",
  sage: "bg-sage",
  salmon: "bg-salmon",
  peach: "bg-peach",
  lime: "bg-lime",
  sky: "bg-sky",
  steel: "bg-steel",
  periwinkle: "bg-periwinkle",
};

export function RibbonCard({
  title,
  tint,
  children,
  badge,
}: {
  title: string;
  tint: Tint;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="border border-ink bg-canvas">
      <div className="flex items-center justify-between gap-2 border-b border-ink bg-canvas px-3 py-1.5">
        <h3 className="font-ui text-[14px] font-bold uppercase tracking-wide text-ink">
          {title}
        </h3>
        {badge ? (
          <span className="bevel border border-ink bg-yellow px-1.5 py-0.5 font-ui text-[10px] font-bold uppercase text-ink">
            {badge}
          </span>
        ) : null}
      </div>
      <div className={`${TINT_BG[tint]} px-4 py-3 font-body text-[14px] leading-[1.45] text-ink`}>
        {children}
      </div>
    </div>
  );
}
