import fs from "fs";
import path from "path";
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

const getBodyRecord = (body: unknown): Record<string, unknown> => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
};

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

app.get("/api/forms/:templateId", (req, res) => {
  try {
    const template = getTemplateById(req.params.templateId);
    const formPath = getFormPath(template.id);
    if (!fs.existsSync(formPath)) {
      res.status(404).json({ message: "Không tìm thấy file HTML của biểu mẫu." });
      return;
    }

    res.json({ template, html: fs.readFileSync(formPath, "utf8") });
  } catch (error) {
    res.status(404).json({
      message: error instanceof Error ? error.message : "Không tìm thấy biểu mẫu.",
    });
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

const serveReactApp = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.sendFile(path.join(CONFIG.projectRoot, "client-dist", "index.html"), (error) => {
    if (error) {
      next(error);
    }
  });
};

app.get("/", serveReactApp);
app.get("/config", serveReactApp);
app.get("/form/:templateId", (req, res, next) => {
  const { templateId } = req.params;
  if (typeof templateId !== "string") {
    res.status(404).send("Không tìm thấy biểu mẫu.");
    return;
  }
  try {
    getTemplateById(templateId);
  } catch (error) {
    res.status(404).send(error instanceof Error ? error.message : "Không tìm thấy biểu mẫu.");
    return;
  }
  serveReactApp(req, res, next);
});

app.use(express.static(path.join(CONFIG.projectRoot, "client-dist")));

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
