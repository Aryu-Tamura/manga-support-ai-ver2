import { Document, Packer, Paragraph } from "docx";

export async function createPlotDocx(script: string): Promise<Uint8Array> {
  const normalized = script.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const doc = new Document({
    sections: [
      {
        children: lines.map((line) => new Paragraph(line || " "))
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
