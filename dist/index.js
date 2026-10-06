"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const generate_docx_1 = require("./generate-docx");
const convert_to_pdf_1 = require("./convert-to-pdf");
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 3000;
app.use(express_1.default.urlencoded({ extended: true }));
app.use(express_1.default.json({ limit: "1mb" }));
const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => {
    const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    };
    return entities[character];
});
const getBodyRecord = (body) => {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return {};
    }
    return body;
};
const renderHome = () => {
    const links = (0, config_1.getTemplateOptions)()
        .map((template) => `
      <article class="form-card">
        <a class="form-link" href="/forms/${encodeURIComponent(template.id)}">
          <strong>${escapeHtml(template.label)}</strong>
          <span>${escapeHtml(template.description)}</span>
        </a>
        <div class="mapping">
          <small>Input: <code>${escapeHtml(template.formFile)}</code></small>
          <small>DOCX: <code>${escapeHtml(template.templateFile)}</code></small>
        </div>
        <a class="settings" href="/config#mapping-${encodeURIComponent(template.id)}" aria-label="Cấu hình ${escapeHtml(template.label)}" title="Cấu hình form và DOCX">⚙ Cấu hình</a>
      </article>
    `)
        .join("");
    return `<!doctype html>
  <html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Biểu mẫu DOCX</title>
    <style>
      *{box-sizing:border-box}body{margin:0;padding:40px 20px;background:#eff6ff;color:#102a43;font:16px Arial,sans-serif}
      main{max-width:1000px;margin:auto}.top{display:flex;align-items:center;justify-content:space-between;gap:16px}
      h1{color:#0f766e}.config{padding:11px 16px;border-radius:8px;background:#0f766e;color:white;text-decoration:none;font-weight:bold}
      .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
      .form-card{display:grid;align-content:start;gap:14px;padding:22px;background:white;border:1px solid #dbe5ef;border-radius:14px}
      .form-link{display:grid;gap:8px;color:inherit;text-decoration:none}.form-link strong{font-size:19px;color:#0f766e}
      .form-link span{color:#475569}.mapping{display:grid;gap:6px}.mapping small{color:#64748b;overflow-wrap:anywhere}
      .settings{justify-self:start;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;color:#0f766e;text-decoration:none;font-weight:bold}
      .settings:hover{background:#dff7f3;border-color:#0f766e}
    </style>
  </head><body><main>
    <div class="top"><div><h1>Biểu mẫu xuất DOCX</h1><p>Chọn biểu mẫu cần nhập liệu.</p></div><a class="config" href="/config">Cấu hình liên kết</a></div>
    <section class="cards">${links}</section>
  </main></body></html>`;
};
app.get("/", (_req, res) => {
    res.type("html").send(renderHome());
});
app.get("/config", (_req, res) => {
    res.sendFile(`${config_1.CONFIG.projectRoot}/config/config.html`);
});
app.get("/api/config", (_req, res) => {
    try {
        res.json({ mappings: (0, config_1.getTemplateOptions)(), files: (0, config_1.getAvailableFiles)() });
    }
    catch (error) {
        console.error("Could not read template configuration:", error);
        res.status(500).json({ message: "Không thể đọc cấu hình biểu mẫu." });
    }
});
app.put("/api/config", (req, res) => {
    try {
        const body = getBodyRecord(req.body);
        if (!Array.isArray(body.mappings)) {
            res.status(400).json({ message: "Danh sách liên kết biểu mẫu không hợp lệ." });
            return;
        }
        const mappings = body.mappings.map((value) => {
            const item = getBodyRecord(value);
            return {
                id: String(item.id ?? "").trim(),
                label: String(item.label ?? "").trim(),
                description: String(item.description ?? "").trim(),
                formFile: String(item.formFile ?? "").trim(),
                templateFile: String(item.templateFile ?? "").trim(),
            };
        });
        (0, config_1.saveTemplateOptions)(mappings);
        res.json({ mappings: (0, config_1.getTemplateOptions)(), message: "Đã lưu cấu hình liên kết." });
    }
    catch (error) {
        console.error("Could not save template configuration:", error);
        res.status(400).json({
            message: error instanceof Error ? error.message : "Không thể lưu cấu hình.",
        });
    }
});
app.get("/forms/:templateId", (req, res) => {
    try {
        const template = (0, config_1.getTemplateById)(req.params.templateId);
        const formPath = (0, config_1.getFormPath)(template.id);
        if (!fs_1.default.existsSync(formPath)) {
            res.status(404).send("Không tìm thấy file HTML của biểu mẫu.");
            return;
        }
        const html = fs_1.default.readFileSync(formPath, "utf8")
            .replaceAll("__FORM_TEMPLATE_ID__", escapeHtml(template.id));
        res.type("html").send(html);
    }
    catch (error) {
        res.status(404).send(error instanceof Error ? escapeHtml(error.message) : "Không tìm thấy biểu mẫu.");
    }
});
app.post("/generate", async (req, res) => {
    try {
        const body = getBodyRecord(req.body);
        const templateId = String(body.template ?? "");
        const template = (0, config_1.getTemplateById)(templateId);
        const formHtml = fs_1.default.readFileSync((0, config_1.getFormPath)(templateId), "utf8");
        const fieldNames = new Set();
        for (const match of formHtml.matchAll(/\bname=["']([^"']+)["']/gi)) {
            if (match[1] !== "template") {
                fieldNames.add(match[1]);
            }
        }
        if (fieldNames.size === 0) {
            throw new Error(`Không tìm thấy input có thuộc tính name trong ${template.formFile}.`);
        }
        const data = Object.fromEntries([...fieldNames].map((name) => [name, String(body[name] ?? "")]));
        const templatePath = (0, config_1.getTemplatePath)(templateId);
        if (!fs_1.default.existsSync(templatePath)) {
            throw new Error(`Không tìm thấy file DOCX đã cấu hình: ${template.templateFile}`);
        }
        const generatedPath = (0, generate_docx_1.generateDocx)(data, templateId);
        const requestedFormat = String(body.outputFormat ?? "docx").toLowerCase();
        if (requestedFormat !== "docx" && requestedFormat !== "pdf") {
            res.status(400).json({ message: "Định dạng tải xuống không hợp lệ." });
            return;
        }
        const downloadPath = requestedFormat === "pdf"
            ? await (0, convert_to_pdf_1.convertDocxToPdf)(generatedPath)
            : generatedPath;
        const downloadName = (0, config_1.getOutputFileName)(templateId).replace(/\.docx$/i, `.${requestedFormat}`);
        res.download(downloadPath, downloadName, (error) => {
            if (error) {
                console.error("DOCX download failed:", error);
            }
        });
    }
    catch (error) {
        console.error("Generate DOCX failed:", error);
        res.status(400).json({
            message: error instanceof Error ? error.message : "Không thể tạo file DOCX.",
        });
    }
});
app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});
