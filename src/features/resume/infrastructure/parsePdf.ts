import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { normalizeWhitespace } from "@/shared/infrastructure/text";

// Extracts whitespace-normalized plain text from a PDF buffer
// (scoring.md §1.3). pdfjs-dist import is infrastructure-only
// (architecture.md §5 rule 3). A scanned/image-only PDF yields an empty or
// near-empty string here -- that's caught by domain/validateParsedText in
// the application layer, not here, so both PDF and DOCX share one check.
//
// AD-41: uses pdfjs-dist's Node ("legacy") build rather than pdf-parse
// (dropped) -- see decisions.md AD-41 for why pdf-parse's pinned, unmaintained
// internal PDF.js fork rejected real-world PDFs it shouldn't have.
export async function parsePdf(data: Buffer): Promise<string> {
  const doc = await getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pageTexts.push(pageText);
    }
    return normalizeWhitespace(pageTexts.join("\n"));
  } finally {
    await doc.destroy();
  }
}
