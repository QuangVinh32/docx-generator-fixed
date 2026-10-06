"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertDocxToPdf = convertDocxToPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
function getLibreOfficeExecutable() {
    const configuredPath = process.env.LIBREOFFICE_PATH;
    if (configuredPath) {
        if (!fs_1.default.existsSync(configuredPath)) {
            throw new Error(`LIBREOFFICE_PATH không tồn tại: ${configuredPath}`);
        }
        return configuredPath;
    }
    if (process.platform === "win32") {
        const candidates = [
            "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
            "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
        ];
        const installedPath = candidates.find((candidate) => fs_1.default.existsSync(candidate));
        if (installedPath) {
            return installedPath;
        }
    }
    return process.platform === "win32" ? "soffice.exe" : "soffice";
}
async function convertDocxToPdf(docxPath) {
    if (!fs_1.default.existsSync(docxPath)) {
        throw new Error(`Không tìm thấy file DOCX để chuyển đổi: ${docxPath}`);
    }
    const outputDir = path_1.default.dirname(docxPath);
    const pdfPath = path_1.default.join(outputDir, `${path_1.default.basename(docxPath, ".docx")}.pdf`);
    const executable = getLibreOfficeExecutable();
    try {
        if (fs_1.default.existsSync(pdfPath)) {
            fs_1.default.unlinkSync(pdfPath);
        }
        await execFileAsync(executable, ["--headless", "--convert-to", "pdf", "--outdir", outputDir, docxPath], { timeout: 60_000, maxBuffer: 1024 * 1024 });
    }
    catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        throw new Error(`Không thể chuyển DOCX sang PDF bằng LibreOffice. ` +
            `Hãy cài LibreOffice hoặc đặt LIBREOFFICE_PATH. Chi tiết: ${details}`);
    }
    if (!fs_1.default.existsSync(pdfPath) || fs_1.default.statSync(pdfPath).size === 0) {
        throw new Error(`LibreOffice không tạo được file PDF: ${pdfPath}`);
    }
    return pdfPath;
}
