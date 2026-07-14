import mammoth from "mammoth";
import { normalizeWhitespace } from "@/shared/infrastructure/text";

// Extracts whitespace-normalized plain text from a DOCX buffer.
// mammoth.extractRawText walks the full document body tree generically
// (raw-text.js recurses into any element's `children`), so table cells are
// included the same as top-level paragraphs -- unlike jobhunt-app's Python
// reference (jobhunt/extract.py::_from_docx), which iterates only
// `document.paragraphs` and silently drops table content (jobhunt bug #6).
export async function parseDocx(data: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: data });
  return normalizeWhitespace(result.value);
}
