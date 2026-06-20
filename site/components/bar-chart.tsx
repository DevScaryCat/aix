// Flat color-block bar comparison (Next.js vs aix). No gradients, no soft
// shadows — just hard catalog-tint blocks, the way a 1996 chart would print.

function Bar({
  name,
  value,
  pct,
  barClass,
}: {
  name: string;
  value: number;
  pct: number;
  barClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-ui text-[11px] font-bold uppercase text-ink sm:w-20">
        {name}
      </span>
      <div className="flex h-5 flex-1 items-center">
        <div
          className={`${barClass} h-full border border-ink`}
          style={{ width: `${Math.max(pct, 1.5)}%` }}
        />
        <span className="ml-2 font-mono text-[12px] font-bold text-ink">
          {value.toLocaleString("en-US")}
        </span>
      </div>
    </div>
  );
}

export function BarChart({
  label,
  nextValue,
  aixValue,
  ratio,
}: {
  label: string;
  nextValue: number;
  aixValue: number;
  ratio: string;
}) {
  const max = Math.max(nextValue, aixValue);
  return (
    <div className="border border-ink bg-canvas p-3">
      <p className="font-ui text-[13px] font-bold uppercase tracking-wide text-ink">
        {label}
      </p>
      <div className="mt-3 space-y-2">
        <Bar name="Next.js" value={nextValue} pct={(nextValue / max) * 100} barClass="bg-steel" />
        <Bar name="aix" value={aixValue} pct={(aixValue / max) * 100} barClass="bg-salmon" />
      </div>
      <p className="mt-3 font-body text-[13px] text-ink">
        → <strong>{ratio}</strong>
      </p>
    </div>
  );
}
