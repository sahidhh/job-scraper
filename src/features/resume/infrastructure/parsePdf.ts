import pdf from "pdf-parse";

// Extracts whitespace-normalized plain text from a PDF buffer
// (scoring.md §1.3). pdf-parse import is infrastructure-only
// (architecture.md §5 rule 3).
export async function parsePdf(data: Buffer): Promise<string> {
  const result = await pdf(data);
  return result.text.replace(/\s+/g, " ").trim();
}
