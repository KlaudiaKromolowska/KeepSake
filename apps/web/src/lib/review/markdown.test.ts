import { describe, expect, it } from "vitest";
import { type Block, parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("returns a single plain span for text with no markup", () => {
    expect(parseInline("hello world")).toEqual([{ text: "hello world", bold: false }]);
  });

  it("splits bold runs on **", () => {
    expect(parseInline("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });

  it("handles bold at the start and multiple bolds", () => {
    expect(parseInline("**x** and **y**")).toEqual([
      { text: "x", bold: true },
      { text: " and ", bold: false },
      { text: "y", bold: true },
    ]);
  });

  it("degrades an unbalanced ** to literal text (no bold)", () => {
    expect(parseInline("a **b c")).toEqual([
      { text: "a ", bold: false },
      { text: "b c", bold: false },
    ]);
  });

  it("never returns an empty span array", () => {
    expect(parseInline("")).toEqual([{ text: "", bold: false }]);
  });
});

describe("parseMarkdown", () => {
  it("parses ## as a level-2 heading (and #/### to 1/3)", () => {
    const blocks = parseMarkdown("# One\n## Two\n### Three");
    expect(blocks).toEqual<Block[]>([
      { type: "heading", level: 1, spans: [{ text: "One", bold: false }] },
      { type: "heading", level: 2, spans: [{ text: "Two", bold: false }] },
      { type: "heading", level: 3, spans: [{ text: "Three", bold: false }] },
    ]);
  });

  it("groups consecutive bullets into one list, parsing inline bold", () => {
    const blocks = parseMarkdown("- first\n- **second** item\n* third");
    expect(blocks).toEqual<Block[]>([
      {
        type: "list",
        items: [
          [{ text: "first", bold: false }],
          [
            { text: "second", bold: true },
            { text: " item", bold: false },
          ],
          [{ text: "third", bold: false }],
        ],
      },
    ]);
  });

  it("joins consecutive non-blank lines into one paragraph and splits on blank lines", () => {
    const blocks = parseMarkdown("line one\nline two\n\nsecond para");
    expect(blocks).toEqual<Block[]>([
      { type: "paragraph", spans: [{ text: "line one line two", bold: false }] },
      { type: "paragraph", spans: [{ text: "second para", bold: false }] },
    ]);
  });

  it("separates a heading, a paragraph and a list correctly", () => {
    const blocks = parseMarkdown("## Summary\nRecall improved.\n\n- rung 15s\n- rung 22.5s");
    expect(blocks).toEqual<Block[]>([
      { type: "heading", level: 2, spans: [{ text: "Summary", bold: false }] },
      { type: "paragraph", spans: [{ text: "Recall improved.", bold: false }] },
      {
        type: "list",
        items: [[{ text: "rung 15s", bold: false }], [{ text: "rung 22.5s", bold: false }]],
      },
    ]);
  });

  it("returns no blocks for empty or whitespace-only input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });

  it("flushes a trailing paragraph and list at end of input", () => {
    expect(parseMarkdown("tail para")).toEqual<Block[]>([
      { type: "paragraph", spans: [{ text: "tail para", bold: false }] },
    ]);
    expect(parseMarkdown("- only item")).toEqual<Block[]>([
      { type: "list", items: [[{ text: "only item", bold: false }]] },
    ]);
  });

  it("does not treat a #-without-space or mid-line - as markup", () => {
    const blocks = parseMarkdown("#nospace\ncost is 3 - 4 dollars");
    expect(blocks).toEqual<Block[]>([
      {
        type: "paragraph",
        spans: [{ text: "#nospace cost is 3 - 4 dollars", bold: false }],
      },
    ]);
  });
});
