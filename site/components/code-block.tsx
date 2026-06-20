// A hard-bordered monospace code box with an optional Helvetica title bar and
// a Times-Roman caption foot — the catalog "ribbon card" chrome applied to code.

export function CodeBlock({
  title,
  code,
  caption,
}: {
  title?: string;
  code: string;
  caption?: string;
}) {
  return (
    <figure className="border border-ink bg-canvas">
      {title ? (
        <figcaption className="border-b border-ink px-3 py-1.5 font-ui text-[13px] font-bold uppercase tracking-wide text-ink">
          {title}
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto px-3 py-3 text-[12.5px] leading-[1.55] text-ink">
        <code>{code}</code>
      </pre>
      {caption ? (
        <figcaption className="border-t border-ink px-3 py-1 font-mono text-[11px] text-ink/70">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
