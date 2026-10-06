"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDocx = generateDocx;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pizzip_1 = __importDefault(require("pizzip"));
const docxtemplater_1 = __importDefault(require("docxtemplater"));
const config_1 = require("./config");
function generateDocx(data, templateId = "appointment") {
    const templatePath = (0, config_1.getTemplatePath)(templateId);
    if (!fs_1.default.existsSync(templatePath)) {
        throw new Error(`Không tìm thấy template: ${templatePath}`);
    }
    const content = fs_1.default.readFileSync(templatePath, "binary");
    const zip = new pizzip_1.default(content);
    const doc = new docxtemplater_1.default(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });
    const normalizedData = Object.fromEntries(Object.entries(data).map(([key, value]) => {
        if (Array.isArray(value)) {
            return [key, value.join(", ")];
        }
        return [key, String(value ?? "")];
    }));
    doc.render(normalizedData);
    fs_1.default.mkdirSync(config_1.CONFIG.outputDir, { recursive: true });
    const outputPath = path_1.default.join(config_1.CONFIG.outputDir, (0, config_1.getOutputFileName)(templateId));
    const buffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    });
    fs_1.default.writeFileSync(outputPath, buffer);
    return outputPath;
}
