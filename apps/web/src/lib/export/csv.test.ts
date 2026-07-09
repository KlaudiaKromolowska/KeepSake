import { describe, expect, it } from "vitest";
import { toCsv, toCsvRow } from "./csv";

describe("toCsvRow — quoting and escaping", () => {
  it("joins plain cells with commas, terminated by CRLF", () => {
    expect(toCsvRow(["a", "b", 1])).toBe("a,b,1\r\n");
  });

  it("quotes a cell containing a comma", () => {
    expect(toCsvRow(["Warsaw, PL"])).toBe('"Warsaw, PL"\r\n');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(toCsvRow(['she said "hi"'])).toBe('"she said ""hi"""\r\n');
  });

  it("quotes a cell containing an embedded newline", () => {
    expect(toCsvRow(["line1\nline2"])).toBe('"line1\nline2"\r\n');
    expect(toCsvRow(["line1\r\nline2"])).toBe('"line1\r\nline2"\r\n');
  });

  it("renders null as an empty cell", () => {
    expect(toCsvRow([null, "x"])).toBe(",x\r\n");
  });

  it("stringifies numbers and booleans without quoting", () => {
    expect(toCsvRow([42, true, false])).toBe("42,true,false\r\n");
  });

  it("leaves an ordinary cell unquoted", () => {
    expect(toCsvRow(["grandson's name"])).toBe("grandson's name\r\n");
  });
});

describe("toCsvRow — formula/CSV-injection guarding", () => {
  it.each([
    ["="],
    ["+"],
    ["-"],
    ["@"],
  ])("prefixes a cell starting with %s with a guarding apostrophe", (prefix) => {
    const cell = `${prefix}cmd|'/bin/calc'!A1`;
    expect(toCsvRow([cell])).toBe(`'${cell}\r\n`);
  });

  it("does not guard a cell where the special character is not the leading one", () => {
    expect(toCsvRow(["cost=5"])).toBe("cost=5\r\n");
  });

  it("guards and quotes together when the guarded cell also needs quoting", () => {
    expect(toCsvRow(["=1,2"])).toBe('"\'=1,2"\r\n');
  });

  it("does not guard an empty cell", () => {
    expect(toCsvRow([""])).toBe("\r\n");
  });
});

describe("toCsv", () => {
  it("writes a header row followed by data rows in stable column order", () => {
    const csv = toCsv(
      ["id", "outcome"],
      [
        ["t1", "recall"],
        ["t2", "miss"],
      ],
    );
    expect(csv).toBe("id,outcome\r\nt1,recall\r\nt2,miss\r\n");
  });

  it("writes just the header row for an empty dataset", () => {
    expect(toCsv(["id", "outcome"], [])).toBe("id,outcome\r\n");
  });
});
