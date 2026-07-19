import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { normalizeWhitespace } from "@/shared/infrastructure/text";

// NOTE: pdf.js loads its worker (pdf.worker.mjs) via an internal *dynamic*
// import that Next's output-file tracer can't follow, so on Vercel the worker
// was omitted from the serverless bundle -- surfacing as "Setting up fake
// worker failed: Cannot find module .../pdf.worker.mjs" on resume upload. The
// fix lives in next.config.ts (`outputFileTracingIncludes`), which force-copies
// pdf.worker.mjs into the lambda at the exact path pdf.js's fallback expects.
// Do NOT add a require.resolve() for the worker here -- webpack rejects a
// require of the ESM-only worker package ("ESM packages need to be imported").

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
