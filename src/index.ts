import fs from "fs";
import express from "express";
import {
  CONFIG,
  getAvailableFiles,
  getFormPath,
  getOutputFileName,
  getTemplateById,
  getTemplateOptions,
  getTemplatePath,
  saveTemplateOptions,
  type TemplateOption,
} from "./config";
import { generateDocx } from "./generate-docx";
import { convertDocxToPdf } from "./convert-to-pdf";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "1mb" }));

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const getBodyRecord = (body: unknown): Record<string, unknown> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
};

const renderHome = (): string => {
  const links = getTemplateOptions()
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
  res.sendFile(`${CONFIG.projectRoot}/config/config.html`);
});

app.get("/api/config", (_req, res) => {
  try {
    res.json({ mappings: getTemplateOptions(), files: getAvailableFiles() });
  } catch (error) {
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

    const mappings: TemplateOption[] = body.mappings.map((value: unknown) => {
      const item = getBodyRecord(value);
      return {
        id: String(item.id ?? "").trim(),
        label: String(item.label ?? "").trim(),
        description: String(item.description ?? "").trim(),
        formFile: String(item.formFile ?? "").trim(),
        templateFile: String(item.templateFile ?? "").trim(),
      };
    });

    saveTemplateOptions(mappings);
    res.json({ mappings: getTemplateOptions(), message: "Đã lưu cấu hình liên kết." });
  } catch (error) {
    console.error("Could not save template configuration:", error);
    res.status(400).json({
      message: error instanceof Error ? error.message : "Không thể lưu cấu hình.",
    });
  }
});

app.get("/forms/:templateId", (req, res) => {
  try {
    const template = getTemplateById(req.params.templateId);
    const formPath = getFormPath(template.id);
    if (!fs.existsSync(formPath)) {
      res.status(404).send("Không tìm thấy file HTML của biểu mẫu.");
      return;
    }

    const html = fs.readFileSync(formPath, "utf8")
      .replaceAll("__FORM_TEMPLATE_ID__", escapeHtml(template.id));
    res.type("html").send(html);
  } catch (error) {
    res.status(404).send(error instanceof Error ? escapeHtml(error.message) : "Không tìm thấy biểu mẫu.");
  }
});

app.post("/generate", async (req, res) => {
  try {
    const body = getBodyRecord(req.body);
    const templateId = String(body.template ?? "");
    const template = getTemplateById(templateId);
    const formHtml = fs.readFileSync(getFormPath(templateId), "utf8");
    const fieldNames = new Set<string>();

    for (const match of formHtml.matchAll(/\bname=["']([^"']+)["']/gi)) {
      if (match[1] !== "template") {
        fieldNames.add(match[1]);
      }
    }

    if (fieldNames.size === 0) {
      throw new Error(`Không tìm thấy input có thuộc tính name trong ${template.formFile}.`);
    }

    const data = Object.fromEntries(
      [...fieldNames].map((name) => [name, String(body[name] ?? "")])
    );
    const templatePath = getTemplatePath(templateId);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Không tìm thấy file DOCX đã cấu hình: ${template.templateFile}`);
    }

    const generatedPath = generateDocx(data, templateId);
    const requestedFormat = String(body.outputFormat ?? "docx").toLowerCase();
    if (requestedFormat !== "docx" && requestedFormat !== "pdf") {
      res.status(400).json({ message: "Định dạng tải xuống không hợp lệ." });
      return;
    }
    const downloadPath = requestedFormat === "pdf"
      ? await convertDocxToPdf(generatedPath)
      : generatedPath;
    const downloadName = getOutputFileName(templateId).replace(/\.docx$/i, `.${requestedFormat}`);

    res.download(downloadPath, downloadName, (error) => {
      if (error) {
        console.error("DOCX download failed:", error);
      }
    });
  } catch (error) {
    console.error("Generate DOCX failed:", error);
    res.status(400).json({
      message: error instanceof Error ? error.message : "Không thể tạo file DOCX.",
    });
  }
});

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
