"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
exports.getTemplateOptions = getTemplateOptions;
exports.getTemplateById = getTemplateById;
exports.getFormPath = getFormPath;
exports.getTemplatePath = getTemplatePath;
exports.getAvailableFiles = getAvailableFiles;
exports.saveTemplateOptions = saveTemplateOptions;
exports.getOutputFileName = getOutputFileName;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const projectRoot = path_1.default.resolve(__dirname, "..");
const registryPath = path_1.default.join(projectRoot, "config", "templates.json");
exports.CONFIG = {
    projectRoot,
    outputDir: path_1.default.join(projectRoot, "output"),
    formsDir: path_1.default.join(projectRoot, "forms"),
    templatesDir: path_1.default.join(projectRoot, "templates"),
    registryPath,
};
const isSafeFileName = (fileName, extension) => path_1.default.basename(fileName) === fileName &&
    fileName.toLowerCase().endsWith(extension);
function getTemplateOptions() {
    const content = fs_1.default.readFileSync(exports.CONFIG.registryPath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
        throw new Error("config/templates.json phải chứa danh sách cấu hình.");
    }
    return parsed.map((item) => {
        if (typeof item !== "object" ||
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
            !isSafeFileName(item.templateFile, ".docx")) {
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
function getTemplateById(templateId) {
    const template = getTemplateOptions().find((item) => item.id === templateId);
    if (!template) {
        throw new Error(`Không có cấu hình cho loại form "${templateId}".`);
    }
    return template;
}
function getFormPath(templateId) {
    return path_1.default.join(exports.CONFIG.formsDir, getTemplateById(templateId).formFile);
}
function getTemplatePath(templateId) {
    return path_1.default.join(exports.CONFIG.templatesDir, getTemplateById(templateId).templateFile);
}
function getAvailableFiles() {
    const listFiles = (directory, extension) => fs_1.default.readdirSync(directory)
        .filter((fileName) => isSafeFileName(fileName, extension))
        .sort((a, b) => a.localeCompare(b));
    return {
        forms: listFiles(exports.CONFIG.formsDir, ".html"),
        templates: listFiles(exports.CONFIG.templatesDir, ".docx"),
    };
}
function saveTemplateOptions(options) {
    const availableFiles = getAvailableFiles();
    const ids = new Set();
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
    fs_1.default.writeFileSync(registryPath, `${JSON.stringify(options, null, 2)}\n`, "utf8");
}
function getOutputFileName(templateId) {
    return `${templateId}-generated.docx`;
}
