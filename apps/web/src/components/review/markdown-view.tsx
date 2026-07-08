import type { JSX } from "react";
import type { Block, Span } from "@/lib/review/markdown";

/** Render inline spans (bold/plain). Keys are precomputed so no raw array index reaches a key prop. */
function Spans({ spans }: { spans: Span[] }) {
  const keyed = spans.map((span, i) => ({ span, key: `s${i}` }));
  return (
    <>
      {keyed.map(({ span, key }) =>
        span.bold ? (
          <strong key={key} className="font-semibold">
            {span.text}
          </strong>
        ) : (
          <span key={key}>{span.text}</span>
        ),
      )}
    </>
  );
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "mt-6 text-2xl font-semibold text-zinc-900",
  2: "mt-6 text-xl font-semibold text-zinc-900",
  3: "mt-4 text-lg font-semibold text-zinc-800",
};

function renderBlock(block: Block, key: string): JSX.Element {
  if (block.type === "heading") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3";
    return (
      <Tag key={key} className={HEADING_CLASS[block.level]}>
        <Spans spans={block.spans} />
      </Tag>
    );
  }
  if (block.type === "list") {
    const items = block.items.map((spans, i) => ({ spans, key: `${key}-i${i}` }));
    return (
      <ul key={key} className="my-3 list-disc space-y-1 pl-6 text-zinc-800">
        {items.map(({ spans, key: itemKey }) => (
          <li key={itemKey}>
            <Spans spans={spans} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p key={key} className="my-3 leading-relaxed text-zinc-800">
      <Spans spans={block.spans} />
    </p>
  );
}

/** Render parsed markdown blocks to safe React elements — never dangerouslySetInnerHTML. */
export function MarkdownView({ blocks }: { blocks: Block[] }) {
  const keyed = blocks.map((block, i) => ({ block, key: `b${i}` }));
  return <>{keyed.map(({ block, key }) => renderBlock(block, key))}</>;
}
