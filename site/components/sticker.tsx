// GIF-era "sticker" — yellow tab with a hard 1px border and a hard-edge bevel.
// Never a soft shadow. Optional slight rotation for the pinned-on feel.

export function Sticker({
  children,
  rotate = false,
  className = "",
}: {
  children: React.ReactNode;
  rotate?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`bevel inline-block border border-ink bg-yellow px-2 py-1 font-ui text-[12px] font-bold uppercase tracking-wide text-ink ${
        rotate ? "-rotate-3" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}
