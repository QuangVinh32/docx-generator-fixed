import fs from "fs";
import path from "path";

const projectRoot = path.resolve(__dirname, "..");
const registryPath = path.join(projectRoot, "config", "templates.json");

const decodeFileText = (buffer: Buffer): string => {
  const candidates = ["utf-8", "windows-1258", "cp1258", "latin1"];

  for (const encoding of candidates) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch {
      // Ignore invalid encodings and try the next candidate.
    }
  }

  return buffer.toString("utf8");
};

const readRegistryContent = (): string => {
  const buffer = fs.readFileSync(registryPath);
  return decodeFileText(buffer);
};

const writeRegistryContent = (content: string): void => {
  fs.writeFileSync(registryPath, content, "utf8");
};

export type TemplateOption = {
  id: string;
  label: string;
  description: string;
  formFile: string;
  templateFile: string;
};

export const CONFIG = {
  projectRoot,
  outputDir: path.join(projectRoot, "output"),
  formsDir: path.join(projectRoot, "forms"),
  templatesDir: path.join(projectRoot, "templates"),
  registryPath,
};

const isSafeFileName = (fileName: string, extension: string): boolean =>
  path.basename(fileName) === fileName &&
  fileName.toLowerCase().endsWith(extension);

export function getTemplateOptions(): TemplateOption[] {
  const content = readRegistryContent();
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error("config/templates.json phải chứa danh sách cấu hình.");
  }

  return parsed.map((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !("label" in item) ||
      !("description" in item) ||
      !("formFile" in item) ||
      !("templateFile" in item) ||
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      typeof item.description !== "string" ||
      typeof item.formFile !== "string" ||
      typeof item.templateFile !== "string" ||
      !/^[a-z0-9][a-z0-9-]*$/.test(item.id) ||
      !isSafeFileName(item.formFile, ".html") ||
      !isSafeFileName(item.templateFile, ".docx")
    ) {
      throw new Error("Cấu hình template không hợp lệ trong config/templates.json.");
    }

    return {
      id: item.id,
      label: item.label,
      description: item.description,
      formFile: item.formFile,
      templateFile: item.templateFile,
    };
  });
}

export function getTemplateById(templateId: string): TemplateOption {
  const template = getTemplateOptions().find((item) => item.id === templateId);
  if (!template) {
    throw new Error(`Không có cấu hình cho loại form "${templateId}".`);
  }
  return template;
}

export function getFormPath(templateId: string): string {
  return path.join(CONFIG.formsDir, getTemplateById(templateId).formFile);
}

export function getTemplatePath(templateId: string): string {
  return path.join(CONFIG.templatesDir, getTemplateById(templateId).templateFile);
}

export function getAvailableFiles(): { forms: string[]; templates: string[] } {
  const listFiles = (directory: string, extension: string): string[] =>
    fs.readdirSync(directory)
      .filter((fileName) => isSafeFileName(fileName, extension))
      .sort((a, b) => a.localeCompare(b));

  return {
    forms: listFiles(CONFIG.formsDir, ".html"),
    templates: listFiles(CONFIG.templatesDir, ".docx"),
  };
}

export function saveTemplateOptions(options: TemplateOption[]): void {
  const availableFiles = getAvailableFiles();
  const ids = new Set<string>();

  for (const option of options) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(option.id) || ids.has(option.id)) {
      throw new Error(`Mã form không hợp lệ hoặc bị trùng: ${option.id}`);
    }
    if (!option.label.trim()) {
      throw new Error(`Vui lòng nhập tên hiển thị cho form "${option.id}".`);
    }
    if (!availableFiles.forms.includes(option.formFile)) {
      throw new Error(`Không tìm thấy file form HTML: ${option.formFile}`);
    }
    if (!availableFiles.templates.includes(option.templateFile)) {
      throw new Error(`Không tìm thấy file DOCX: ${option.templateFile}`);
    }
    ids.add(option.id);
  }

  writeRegistryContent(`${JSON.stringify(options, null, 2)}\n`);
}

export function getOutputFileName(templateId: string): string {
  return `${templateId}-generated.docx`;
}
