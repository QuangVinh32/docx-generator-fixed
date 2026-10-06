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

function renderHome(mappings: TemplateOption[]): string {
  const links = mappings.map((template) => `
    <article class="form-card">
      <a class="form-link" href="/forms/${encodeURIComponent(template.id)}">
        <strong>${escapeHtml(template.label)}</strong>
        <span>${escapeHtml(template.description)}</span>
      </a>
      <div class="mapping">
        <small>Input: <code>${escapeHtml(template.formFile)}</code></small>
        <small>DOCX: <code>${escapeHtml(template.templateFile)}</code></small>
      </div>
      <a class="settings" href="/config#mapping-${encodeURIComponent(template.id)}">⚙ Cấu hình</a>
    </article>
  `).join("");

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
    </style>
  </head><body><main>
    <div class="top"><div><h1>Biểu mẫu xuất DOCX</h1><p>Chọn biểu mẫu cần nhập liệu.</p></div><a class="config" href="/config">Cấu hình liên kết</a></div>
    <section class="cards">${links}</section>
  </main></body></html>`;
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

  const formHtml = await getAssetText(env, request.url, `/forms/${template.formFile}`);
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
    return new Response(renderHome(await getMappings(env, request.url)), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (request.method === "GET" && url.pathname === "/config") {
    const response = await assetFetch(env, request.url, "/config/config.html");
    if (!response.ok) {
      throw new Error("Không tìm thấy giao diện cấu hình đã triển khai.");
    }
    return response;
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

  const formMatch = request.method === "GET" && url.pathname.match(/^\/forms\/([a-z0-9][a-z0-9-]*)$/);
  if (formMatch) {
    const mappings = await getMappings(env, request.url);
    const template = mappings.find((item) => item.id === formMatch[1]);
    if (!template) {
      return new Response("Không tìm thấy biểu mẫu.", { status: 404 });
    }
    let html = await getAssetText(env, request.url, `/forms/${template.formFile}`);
    html = html.replaceAll("__FORM_TEMPLATE_ID__", escapeHtml(template.id));
    html = html.replace(
      /<\/head>/i,
      '<style>button[name="outputFormat"][value="pdf"]{display:none!important}</style></head>'
    );
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (request.method === "POST" && url.pathname === "/generate") {
    return handleGenerate(request, env, await getMappings(env, request.url));
  }

  return new Response("Not found", { status: 404 });
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
