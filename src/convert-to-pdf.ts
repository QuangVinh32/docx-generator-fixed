import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function getLibreOfficeExecutable(): string {
  const configuredPath = process.env.LIBREOFFICE_PATH;
  if (configuredPath) {
    if (!fs.existsSync(configuredPath)) {
      throw new Error(`LIBREOFFICE_PATH không tồn tại: ${configuredPath}`);
    }
    return configuredPath;
  }

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ];
    const installedPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (installedPath) {
      return installedPath;
    }
  }

  return process.platform === "win32" ? "soffice.exe" : "soffice";
}

export async function convertDocxToPdf(docxPath: string): Promise<string> {
  if (!fs.existsSync(docxPath)) {
    throw new Error(`Không tìm thấy file DOCX để chuyển đổi: ${docxPath}`);
  }

  const outputDir = path.dirname(docxPath);
  const pdfPath = path.join(outputDir, `${path.basename(docxPath, ".docx")}.pdf`);
  const executable = getLibreOfficeExecutable();

  try {
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }

    await execFileAsync(
      executable,
      ["--headless", "--convert-to", "pdf", "--outdir", outputDir, docxPath],
      { timeout: 60_000, maxBuffer: 1024 * 1024 }
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Không thể chuyển DOCX sang PDF bằng LibreOffice. ` +
      `Hãy cài LibreOffice hoặc đặt LIBREOFFICE_PATH. Chi tiết: ${details}`
    );
  }

  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) {
    throw new Error(`LibreOffice không tạo được file PDF: ${pdfPath}`);
  }

  return pdfPath;
}
