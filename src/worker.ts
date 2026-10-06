import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

type TemplateOption = {
  id: string;
  label: string;
  description: string;
  formFile: string;
  templateFile: string;
};

type AvailableFiles = {
  forms: string[];
  templates: string[];
};

interface WorkerEnvironment {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  TEMPLATE_CONFIG: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, { status });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assetFetch = (
  env: WorkerEnvironment,
  requestUrl: string,
  assetPath: string
): Promise<Response> =>
  env.ASSETS.fetch(new Request(new URL(assetPath, requestUrl)));

async function getAssetText(
  env: WorkerEnvironment,
  requestUrl: string,
  assetPath: string
): Promise<string> {
  const response = await assetFetch(env, requestUrl, assetPath);
  if (!response.ok) {
    throw new Error(`Không tìm thấy tài nguyên đã triển khai: ${assetPath}`);
  }
  return response.text();
}

function parseMappings(value: unknown): TemplateOption[] {
  if (!Array.isArray(value)) {
    throw new Error("Danh sách cấu hình biểu mẫu không hợp lệ.");
  }

  return value.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      typeof item.description !== "string" ||
      typeof item.formFile !== "string" ||
      typeof item.templateFile !== "string" ||
      !/^[a-z0-9][a-z0-9-]*$/.test(item.id) ||
      item.formFile !== item.formFile.split(/[\\/]/).pop() ||
      !item.formFile.toLowerCase().endsWith(".html") ||
      item.templateFile !== item.templateFile.split(/[\\/]/).pop() ||
      !item.templateFile.toLowerCase().endsWith(".docx")
    ) {
      throw new Error("Cấu hình template không hợp lệ.");
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

async function getMappings(
  env: WorkerEnvironment,
  requestUrl: string
): Promise<TemplateOption[]> {
  if (!env.TEMPLATE_CONFIG) {
    throw new Error("Thiếu binding KV TEMPLATE_CONFIG trong cấu hình Cloudflare.");
  }

  const stored = await env.TEMPLATE_CONFIG.get("mappings");
  if (stored !== null) {
    return parseMappings(JSON.parse(stored));
  }

  const defaults = await getAssetText(env, requestUrl, "/config/templates.json");
  return parseMappings(JSON.parse(defaults));
}

async function getAvailableFiles(
  env: WorkerEnvironment,
  requestUrl: string
): Promise<AvailableFiles> {
  const content = await getAssetText(env, requestUrl, "/worker-manifest.json");
  const files: unknown = JSON.parse(content);
  if (
    !isRecord(files) ||
    !Array.isArray(files.forms) ||
    !Array.isArray(files.templates) ||
    !files.forms.every((file) => typeof file === "string") ||
    !files.templates.every((file) => typeof file === "string")
  ) {
    throw new Error("Danh sách file triển khai không hợp lệ.");
  }
  return { forms: files.forms, templates: files.templates };
}

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return result;
}

function normalizeFormData(data: Record<string, string | string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(", ") : value,
    ])
  );
}

async function handleGenerate(
  request: Request,
  env: WorkerEnvironment,
  mappings: TemplateOption[]
): Promise<Response> {
  const body = await request.formData();
  const templateId = String(body.get("template") ?? "");
  const template = mappings.find((item) => item.id === templateId);
  if (!template) {
    return jsonResponse({ message: `Không có cấu hình cho loại form "${templateId}".` }, 400);
  }

  const formHtml = await getAssetText(env, request.url, `/form-assets/${template.formFile}`);
  const fieldNames = new Set<string>();
  for (const match of formHtml.matchAll(/\bname=["']([^"']+)["']/gi)) {
    if (match[1] !== "template" && match[1] !== "outputFormat") {
      fieldNames.add(match[1]);
    }
  }
  if (fieldNames.size === 0) {
    return jsonResponse({ message: `Không tìm thấy input có thuộc tính name trong ${template.formFile}.` }, 400);
  }

  const data: Record<string, string | string[]> = {};
  for (const name of fieldNames) {
    const values = body.getAll(name)
      .filter((value): value is string => typeof value === "string");
    data[name] = values.length > 1 ? values : values[0] ?? "";
  }

  const outputFormat = String(body.get("outputFormat") ?? "docx").toLowerCase();
  if (outputFormat !== "docx") {
    return jsonResponse({ message: "Cloudflare hiện chỉ hỗ trợ tải DOCX; PDF chưa được bật." }, 400);
  }

  const templateResponse = await assetFetch(env, request.url, `/templates/${template.templateFile}`);
  if (!templateResponse.ok) {
    throw new Error(`Không tìm thấy file DOCX đã cấu hình: ${template.templateFile}`);
  }
  const templateBytes = new Uint8Array(await templateResponse.arrayBuffer());
  const zip = new PizZip(bytesToBinaryString(templateBytes));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(normalizeFormData(data));

  const output = doc.getZip().generate({
    type: "uint8array",
    compression: "DEFLATE",
  });
  const outputBuffer = new ArrayBuffer(output.byteLength);
  new Uint8Array(outputBuffer).set(output);
  const fileName = `${template.id}-generated.docx`;
  return new Response(outputBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

async function routeRequest(
  request: Request,
  env: WorkerEnvironment
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return assetFetch(env, request.url, "/index.html");
  }

  if (request.method === "GET" && url.pathname === "/config") {
    return assetFetch(env, request.url, "/index.html");
  }

  const formPageMatch = request.method === "GET" &&
    url.pathname.match(/^\/form\/([a-z0-9][a-z0-9-]*)$/);
  if (formPageMatch) {
    const mappings = await getMappings(env, request.url);
    if (!mappings.some((item) => item.id === formPageMatch[1])) {
      return new Response("Không tìm thấy biểu mẫu.", { status: 404 });
    }
    return assetFetch(env, request.url, "/index.html");
  }

  const formDataMatch = request.method === "GET" &&
    url.pathname.match(/^\/api\/forms\/([a-z0-9][a-z0-9-]*)$/);
  if (formDataMatch) {
    const mappings = await getMappings(env, request.url);
    const template = mappings.find((item) => item.id === formDataMatch[1]);
    if (!template) {
      return jsonResponse({ message: "Không tìm thấy biểu mẫu." }, 404);
    }
    const html = await getAssetText(env, request.url, `/form-assets/${template.formFile}`);
    return jsonResponse({ template, html });
  }

  if (url.pathname === "/api/config" && request.method === "GET") {
    const [mappings, files] = await Promise.all([
      getMappings(env, request.url),
      getAvailableFiles(env, request.url),
    ]);
    return jsonResponse({ mappings, files });
  }

  if (url.pathname === "/api/config" && request.method === "PUT") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ message: "Nội dung JSON không hợp lệ." }, 400);
    }
    if (!isRecord(body) || !Array.isArray(body.mappings)) {
      return jsonResponse({ message: "Danh sách liên kết biểu mẫu không hợp lệ." }, 400);
    }

    let mappings: TemplateOption[];
    try {
      mappings = parseMappings(body.mappings);
    } catch (error) {
      return jsonResponse({
        message: error instanceof Error ? error.message : "Cấu hình biểu mẫu không hợp lệ.",
      }, 400);
    }
    const files = await getAvailableFiles(env, request.url);
    const ids = new Set<string>();
    for (const mapping of mappings) {
      if (ids.has(mapping.id)) {
        return jsonResponse({ message: `Mã form không hợp lệ hoặc bị trùng: ${mapping.id}` }, 400);
      }
      if (!mapping.label.trim()) {
        return jsonResponse({ message: `Vui lòng nhập tên hiển thị cho form "${mapping.id}".` }, 400);
      }
      if (!files.forms.includes(mapping.formFile)) {
        return jsonResponse({ message: `Không tìm thấy file form HTML: ${mapping.formFile}` }, 400);
      }
      if (!files.templates.includes(mapping.templateFile)) {
        return jsonResponse({ message: `Không tìm thấy file DOCX: ${mapping.templateFile}` }, 400);
      }
      ids.add(mapping.id);
    }

    await env.TEMPLATE_CONFIG.put("mappings", JSON.stringify(mappings));
    return jsonResponse({ mappings, message: "Đã lưu cấu hình liên kết." });
  }

  if (request.method === "POST" && url.pathname === "/generate") {
    return handleGenerate(request, env, await getMappings(env, request.url));
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      console.error("Cloudflare Worker request failed:", error);
      return jsonResponse({
        message: error instanceof Error ? error.message : "Đã xảy ra lỗi khi xử lý yêu cầu.",
      }, 500);
    }
  },
};
