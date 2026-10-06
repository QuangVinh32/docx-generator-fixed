import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { CONFIG, getOutputFileName, getTemplatePath } from "./config";

export type DocumentData = Record<string, string | string[]>;

export function generateDocx(data: DocumentData, templateId = "appointment"): string {
  const templatePath = getTemplatePath(templateId);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Không tìm thấy template: ${templatePath}`);
  }

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const normalizedData = Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, value.join(", ")];
      }
      return [key, String(value ?? "")];
    })
  );

  doc.render(normalizedData);

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  const outputPath = path.join(CONFIG.outputDir, getOutputFileName(templateId));
  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}