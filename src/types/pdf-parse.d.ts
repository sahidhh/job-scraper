declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }

  function pdf(
    data: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;

  export default pdf;
}
