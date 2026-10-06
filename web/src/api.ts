import type { ConfigResponse, FormDefinition, FormField, TemplateOption } from "./types";

async function readJson<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof result === "object" && result !== null && "message" in result &&
      typeof result.message === "string"
        ? result.message
        : "Yêu cầu không thành công.";
    throw new Error(message);
  }
  return result as T;
}

export async function loadConfig(): Promise<{
  mappings: TemplateOption[];
  files: ConfigResponse["files"];
  editable: boolean;
}> {
  return readJson(await fetch("/api/config", { cache: "no-store" }));
}

export async function saveConfig(mappings: TemplateOption[]): Promise<{
  mappings: TemplateOption[];
  message: string;
}> {
  return readJson(await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mappings }),
  }));
}

function parseFormHtml(html: string, template: TemplateOption): FormDefinition {
  const document = new DOMParser().parseFromString(html, "text/html");
  const fields: FormField[] = [];

  for (const labelElement of document.querySelectorAll("label")) {
    const control = labelElement.querySelector("input, textarea, select");
    if (!control) {
      continue;
    }

    const name = control.getAttribute("name") ?? "";
    const inputType = control instanceof HTMLInputElement
      ? control.type.toLowerCase()
      : control instanceof HTMLTextAreaElement
        ? "textarea"
        : "select";
    if (!name || inputType === "hidden" || inputType === "submit" || inputType === "button") {
      continue;
    }

    const labelCopy = labelElement.cloneNode(true) as HTMLElement;
    labelCopy.querySelectorAll("input, textarea, select").forEach((element) => element.remove());

    const options = control instanceof HTMLSelectElement
      ? Array.from(control.options).map((option) => ({
          value: option.value,
          label: option.textContent?.trim() ?? option.value,
        }))
      : [];
    const initialValue =
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
        ? control.value
        : "";
    const field: FormField = {
      name,
      label: labelCopy.textContent?.trim() || name,
      kind: control instanceof HTMLTextAreaElement
        ? "textarea"
        : control instanceof HTMLSelectElement
          ? "select"
          : "input",
      inputType,
      required: control.hasAttribute("required"),
      initialValue,
      wide: labelElement.classList.contains("wide"),
      options,
    };
    fields.push(field);
  }

  return {
    template,
    title: document.querySelector("h1")?.textContent?.trim() || template.label,
    description: document.querySelector("form")?.previousElementSibling?.textContent?.trim() ?? "",
    fields,
  };
}

export async function loadForm(templateId: string): Promise<FormDefinition> {
  const response = await fetch(`/api/forms/${encodeURIComponent(templateId)}`, {
    cache: "no-store",
  });
  const result = await readJson<{ template: TemplateOption; html: string }>(response);
  return parseFormHtml(result.html, result.template);
}
