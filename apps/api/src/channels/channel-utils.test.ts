import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatForWhatsApp, fileUrlToFilename } from "./channel-utils.js";

describe("formatForWhatsApp", () => {
  it("converts **bold** to *bold*", () => {
    assert.equal(formatForWhatsApp("**hello**"), "*hello*");
  });

  it("converts inline `code` to ```code```", () => {
    assert.equal(formatForWhatsApp("`foo`"), "```foo```");
  });

  it("leaves triple-backtick fences unchanged", () => {
    const input = "```\nconst x = 1;\n```";
    assert.equal(formatForWhatsApp(input), input);
  });

  it("truncates at 4096 chars with ellipsis", () => {
    const long = "a".repeat(5000);
    const result = formatForWhatsApp(long);
    assert.equal(result.length, 4096);
    assert.ok(result.endsWith("..."));
  });

  it("does not truncate text at exactly 4096 chars", () => {
    const exact = "a".repeat(4096);
    assert.equal(formatForWhatsApp(exact), exact);
  });

  it("handles mixed bold and code in one string", () => {
    assert.equal(
      formatForWhatsApp("Use **npm** and run `npm install`"),
      "Use *npm* and run ```npm install```"
    );
  });

  it("returns empty string unchanged", () => {
    assert.equal(formatForWhatsApp(""), "");
  });
});

describe("fileUrlToFilename", () => {
  it("extracts filename from a plain URL", () => {
    assert.equal(fileUrlToFilename("https://example.com/files/report.pdf"), "report.pdf");
  });

  it("strips query string before extracting filename", () => {
    assert.equal(
      fileUrlToFilename("https://example.com/files/report.pdf?token=abc123"),
      "report.pdf"
    );
  });

  it("handles deeply nested paths", () => {
    assert.equal(
      fileUrlToFilename("https://storage.example.com/bucket/tenant/2024/invoice.xlsx"),
      "invoice.xlsx"
    );
  });
});
