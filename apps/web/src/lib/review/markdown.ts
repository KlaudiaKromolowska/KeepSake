/**
 * Tiny, safe markdown parser for the streamed RCT report. Pure — produces a block tree that the
 * React view maps to elements, so nothing is ever fed to `dangerouslySetInnerHTML`. Supports only
 * what the analyst prompt emits: `#`/`##`/`###` headings, `-`/`*` bullet lists, `**bold**` inline,
 * and blank-line-separated paragraphs. Unknown syntax degrades to plain text.
 */

export interface Span {
  text: string;
  bold: boolean;
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; spans: Span[] }
  | { type: "list"; items: Span[][] }
  | { type: "paragraph"; spans: Span[] };

/** Split a line into bold/plain spans on `**…**`. An unbalanced `**` degrades to literal text. */
export function parseInline(text: string): Span[] {
  const parts = text.split("**");
  const spans: Span[] = [];
  // Balanced runs alternate plain/bold: even index = plain, odd = bold. An odd number of `**`
  // (unbalanced) leaves a trailing plain segment, which is exactly what we want.
  const balanced = parts.length % 2 === 1;
  parts.forEach((segment, i) => {
    if (segment === "") return;
    const bold = balanced && i % 2 === 1;
    spans.push({ text: segment, bold });
  });
  return spans.length ? spans : [{ text, bold: false }];
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

/** Parse report markdown into a flat list of blocks. */
export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Span[][] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", spans: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: "list", items: list });
      list = null;
    }
  };

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        spans: parseInline(heading[2].trim()),
      });
      continue;
    }

    const bullet = BULLET.exec(line.trimStart());
    if (bullet) {
      flushParagraph();
      list ??= [];
      list.push(parseInline(bullet[1].trim()));
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}
