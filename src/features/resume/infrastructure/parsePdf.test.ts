import { describe, expect, it } from "vitest";
import { parsePdf } from "./parsePdf";

// Builds a minimal but structurally valid single-page PDF (hand-written PDF
// syntax with a correct xref table) whose content stream draws exactly
// `text`. Mirrors parseDocx.test.ts's "build a real fixture, no binary file
// checked into the repo" approach.
function buildMinimalPdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const contentStream = `BT /F1 24 Tf 72 700 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0]; // object 0 is the free-list head, never referenced
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

describe("parsePdf", () => {
  it("extracts text from a valid single-page PDF", async () => {
    const pdf = buildMinimalPdf("Experienced with React and Node.js development");

    const text = await parsePdf(pdf);

    expect(text).toContain("Experienced with React and Node.js development");
  });

  it("throws on a buffer that is not a PDF at all", async () => {
    await expect(parsePdf(Buffer.from("this is plainly not a pdf file"))).rejects.toThrow();
  });
});
