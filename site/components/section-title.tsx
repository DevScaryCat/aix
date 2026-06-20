// Section eyebrow — the chunky Arial Black title set inside a flat catalog-tint
// color block. One tint per section, used as a "product line" marker.

export type Tint =
  | "olive"
  | "sage"
  | "salmon"
  | "peach"
  | "lime"
  | "sky"
  | "steel"
  | "periwinkle";

// Literal classes so Tailwind's static scanner emits them.
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

export function SectionTitle({
  tint,
  children,
  id,
  kicker,
}: {
  tint: Tint;
  children: React.ReactNode;
  id?: string;
  kicker?: string;
}) {
  return (
    <div className={`${TINT_BG[tint]} border border-ink px-4 py-5 sm:px-6 sm:py-6`}>
      {kicker ? (
        <p className="mb-1 font-ui text-[11px] font-bold uppercase tracking-[0.15em] text-ink/70">
          {kicker}
        </p>
      ) : null}
      <h2
        id={id}
        className="scroll-mt-4 font-display text-[26px] uppercase leading-none text-ink sm:text-[34px]"
      >
        {children}
      </h2>
    </div>
  );
}
