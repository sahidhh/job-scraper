import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseDocx } from "./parseDocx";

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const PACKAGE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Builds a minimal but structurally valid .docx (an OPC zip package) whose
// word/document.xml body is exactly `bodyXml`. Lets tests exercise mammoth
// against a real DOCX fixture without a binary file checked into the repo.
async function buildDocx(bodyXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", PACKAGE_RELS_XML);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function tableCell(text: string): string {
  return `<w:tc>${paragraph(text)}</w:tc>`;
}

function tableRow(cells: string[]): string {
  return `<w:tr>${cells.map(tableCell).join("")}</w:tr>`;
}

describe("parseDocx", () => {
  it("extracts plain paragraph text", async () => {
    const docx = await buildDocx(paragraph("Experienced engineer with React expertise"));

    const text = await parseDocx(docx);

    expect(text).toContain("Experienced engineer with React expertise");
  });

  // jobhunt bug #6: jobhunt-app's Python reference (extract.py::_from_docx)
  // iterates only `document.paragraphs`, which python-docx does not
  // populate with table cell content -- a skills table is silently dropped.
  // mammoth's extractRawText recurses into every element's children
  // (raw-text.js), including w:tbl/w:tr/w:tc, so this must not regress.
  it("extracts table cell text, not just top-level paragraphs", async () => {
    const table =
      `<w:tbl>` +
      tableRow(["Skill", "Years"]) +
      tableRow(["Python", "5"]) +
      tableRow(["Kubernetes", "3"]) +
      `</w:tbl>`;
    const docx = await buildDocx(table);

    const text = await parseDocx(docx);

    expect(text).toContain("Python");
    expect(text).toContain("Kubernetes");
    expect(text).toContain("Skill");
    expect(text).toContain("Years");
  });

  it("extracts both ordinary paragraphs and table content from the same document", async () => {
    const body =
      paragraph("Summary: backend engineer") +
      `<w:tbl>${tableRow(["Skill", "Years"])}${tableRow(["AWS", "4"])}</w:tbl>` +
      paragraph("References available on request");
    const docx = await buildDocx(body);

    const text = await parseDocx(docx);

    expect(text).toContain("Summary: backend engineer");
    expect(text).toContain("AWS");
    expect(text).toContain("References available on request");
  });
});
