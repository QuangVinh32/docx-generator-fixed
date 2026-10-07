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
  CLOUDCONVERT_API_KEY?: string;
}

type CloudConvertTask = {
  name?: string;
  status?: string;
  message?: string;
  result?: {
    form?: {
      url?: string;
      parameters?: Record<string, unknown>;
    };
    files?: Array<{ url?: string }>;
  };
};

type CloudConvertJob = {
  id?: string;
  status?: string;
  tasks?: CloudConvertTask[];
};

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

function parseCloudConvertJob(value: unknown): CloudConvertJob {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    typeof value.data.id !== "string" ||
    typeof value.data.status !== "string" ||
    !Array.isArray(value.data.tasks) ||
    !value.data.tasks.every((task) => isRecord(task))
  ) {
    throw new Error("CloudConvert trả về dữ liệu công việc không hợp lệ.");
  }
  return value.data as CloudConvertJob;
}

async function cloudConvertApiRequest(
  url: string,
  apiKey: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`CloudConvert API lỗi (${response.status}): ${details}`);
  }
  return response.json();
}

async function convertDocxToPdf(
  docxBytes: ArrayBuffer,
  fileName: string,
  apiKey: string
): Promise<ArrayBuffer> {
  const jobData = await cloudConvertApiRequest(
    "https://api.cloudconvert.com/v2/jobs",
    apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tasks: {
          "import-docx": { operation: "import/upload" },
          "convert-docx": {
            operation: "convert",
            input: "import-docx",
            input_format: "docx",
            output_format: "pdf",
          },
          "export-pdf": { operation: "export/url", input: "convert-docx" },
        },
      }),
    }
  );
  let job = parseCloudConvertJob(jobData);
  const uploadTask = job.tasks?.find((task) => task.name === "import-docx");
  const uploadUrl = uploadTask?.result?.form?.url;
  const uploadParameters = uploadTask?.result?.form?.parameters;
  if (!uploadUrl || !uploadParameters) {
    throw new Error("CloudConvert không cung cấp thông tin upload file.");
  }

  const uploadForm = new FormData();
  for (const [key, value] of Object.entries(uploadParameters)) {
    if (typeof value === "string" || typeof value === "number") {
      uploadForm.append(key, String(value));
    }
  }
  uploadForm.append("file", new Blob([docxBytes]), fileName);
  const uploadResponse = await fetch(uploadUrl, { method: "POST", body: uploadForm });
  if (!uploadResponse.ok) {
    const details = (await uploadResponse.text()).slice(0, 500);
    throw new Error(`Không thể upload DOCX lên CloudConvert (${uploadResponse.status}): ${details}`);
  }

  const deadline = Date.now() + 110_000;
  while (job.status !== "finished") {
    const failedTask = job.tasks?.find((task) => task.status === "error");
    if (job.status === "error" || failedTask) {
      throw new Error(
        `CloudConvert không chuyển được DOCX sang PDF: ${failedTask?.message ?? "công việc thất bại."}`
      );
    }
    if (!job.id) {
      throw new Error("CloudConvert không trả về mã công việc.");
    }
    if (Date.now() >= deadline) {
      throw new Error("CloudConvert chuyển PDF quá thời gian chờ. Vui lòng thử lại.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const updated = await cloudConvertApiRequest(
      `https://api.cloudconvert.com/v2/jobs/${encodeURIComponent(job.id)}`,
      apiKey
    );
    job = parseCloudConvertJob(updated);
  }

  const downloadUrl = job.tasks
    ?.find((task) => task.name === "export-pdf")
    ?.result?.files?.[0]?.url;
  if (!downloadUrl) {
    throw new Error("CloudConvert hoàn tất nhưng không trả về file PDF.");
  }
  const pdfResponse = await fetch(downloadUrl);
  if (!pdfResponse.ok) {
    throw new Error(`Không thể tải file PDF từ CloudConvert (${pdfResponse.status}).`);
  }
  const pdfBytes = await pdfResponse.arrayBuffer();
  if (pdfBytes.byteLength < 5 || new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("CloudConvert trả về file PDF không hợp lệ.");
  }
  return pdfBytes;
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
  const cloudConvertApiKey = env.CLOUDCONVERT_API_KEY;
  if (outputFormat !== "docx" && outputFormat !== "pdf") {
    return jsonResponse({ message: "Định dạng tải xuống không hợp lệ." }, 400);
  }
  if (outputFormat === "pdf" && !cloudConvertApiKey) {
    return jsonResponse({
      message: "Chức năng PDF chưa được cấu hình. Hãy đặt secret CLOUDCONVERT_API_KEY trên Cloudflare.",
    }, 503);
  }
  if (outputFormat === "pdf" && body.get("cloudConvertConsent") !== "true") {
    return jsonResponse({
      message: "Cần xác nhận gửi tài liệu tới CloudConvert để tạo PDF.",
    }, 400);
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
  const docxBuffer = new ArrayBuffer(output.byteLength);
  new Uint8Array(docxBuffer).set(output);
  const fileName = `${template.id}-generated.${outputFormat}`;
  let responseBytes = docxBuffer;
  if (outputFormat === "pdf") {
    if (!cloudConvertApiKey) {
      throw new Error("Thiếu secret CLOUDCONVERT_API_KEY trên Cloudflare.");
    }
    responseBytes = await convertDocxToPdf(
      docxBuffer,
      `${template.id}-generated.docx`,
      cloudConvertApiKey
    );
  }
  return new Response(responseBytes, {
    headers: {
      "Content-Type": outputFormat === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    return jsonResponse({ mappings, files, editable: false });
  }

  if (url.pathname === "/api/config" && request.method === "PUT") {
    return jsonResponse({
      message: "Worker đang dùng cấu hình tĩnh. Hãy sửa config/templates.json trong repo rồi deploy lại.",
    }, 405);
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
