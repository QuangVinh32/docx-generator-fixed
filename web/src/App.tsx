import { useEffect, useState, type FormEvent } from "react";
import { loadConfig, loadForm, saveConfig } from "./api";
import type {
  AvailableFiles,
  FormDefinition,
  FormField,
  TemplateOption,
} from "./types";

function ErrorMessage({ children }: { children: string }) {
  return <div className="notice notice-error" role="alert">{children}</div>;
}

function HomePage() {
  const [mappings, setMappings] = useState<TemplateOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig().then((result) => setMappings(result.mappings))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Không tải được danh sách biểu mẫu.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page-shell">
      <header className="page-heading">
        <div>
          <span className="eyebrow">DOCX GENERATOR</span>
          <h1>Biểu mẫu xuất DOCX</h1>
          <p>Chọn biểu mẫu cần nhập liệu.</p>
        </div>
        <a className="button button-dark" href="/config">Cấu hình liên kết</a>
      </header>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {loading && <div className="loading-card">Đang tải danh sách biểu mẫu...</div>}
      {!loading && !error && mappings.length === 0 && (
        <div className="loading-card">Chưa có biểu mẫu nào được cấu hình.</div>
      )}
      {!loading && !error && mappings.length > 0 && (
          <section className="template-grid">
            {mappings.map((template) => (
              <article className="template-card" key={template.id}>
                <div className="card-icon" aria-hidden="true">▤</div>
                <div>
                  <h2>{template.label}</h2>
                  <p>{template.description}</p>
                </div>
                <div className="file-pair">
                  <span><small>HTML</small>{template.formFile}</span>
                  <span><small>DOCX</small>{template.templateFile}</span>
                </div>
                <div className="card-actions">
                  <a className="button button-primary" href={`/form/${encodeURIComponent(template.id)}`}>
                    Mở biểu mẫu <span aria-hidden="true">→</span>
                  </a>
                  <a className="icon-link" href={`/config#mapping-${encodeURIComponent(template.id)}`}
                    aria-label={`Cấu hình ${template.label}`} title="Cấu hình biểu mẫu">
                    ⚙
                  </a>
                </div>
              </article>
            ))}
          </section>
      )}
    </main>
  );
}

function ConfigPage() {
  const [mappings, setMappings] = useState<TemplateOption[]>([]);
  const [files, setFiles] = useState<AvailableFiles>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async (showStatus: boolean) => {
    setBusy(true);
    setError("");
    try {
      const result = await loadConfig();
      setFiles(result.files);
      if (showStatus) {
        setStatus("Đã cập nhật danh sách file HTML và DOCX.");
      } else {
        setMappings(result.mappings);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được cấu hình.");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(false);
  }, []);

  useEffect(() => {
    if (!loading && window.location.hash) {
      document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, mappings.length]);

  const updateMapping = (index: number, update: Partial<TemplateOption>) => {
    setMappings((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...update } : item
    ));
    setStatus("");
  };

  const addMapping = () => {
    if (!files?.forms.length || !files.templates.length) {
      setError("Thêm file .html vào forms và .docx vào templates trước.");
      return;
    }
    setError("");
    setStatus("");
    setMappings((current) => [...current, {
      id: "",
      label: "",
      description: "",
      formFile: files.forms[0],
      templateFile: files.templates[0],
    }]);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    setStatus("Đang lưu cấu hình...");
    try {
      const result = await saveConfig(mappings);
      setMappings(result.mappings);
      setStatus(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được cấu hình.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-shell config-shell">
      <a className="back-link" href="/">← Danh sách biểu mẫu</a>
      <header className="page-heading config-heading">
        <div>
          <span className="eyebrow">QUẢN LÝ</span>
          <h1>Cấu hình biểu mẫu</h1>
          <p>Kết nối form HTML với mẫu tài liệu DOCX.</p>
        </div>
        <button className="button button-outline" type="button" disabled={busy}
          onClick={() => void refresh(true)}>↻ Làm mới danh sách file</button>
      </header>
      <div className="help-panel">
        Tên thuộc tính <code>name</code> của trường nhập trong HTML cần khớp với biến trong DOCX,
        ví dụ <code>patientName</code> ↔ <code>{"{patientName}"}</code>.
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {loading ? <div className="loading-card">Đang tải cấu hình...</div> : (
        <>
          <div className="mapping-list">
            {mappings.map((mapping, index) => (
              <article className="mapping-card" id={`mapping-${mapping.id}`} key={`${mapping.id}-${index}`}>
                <div className="mapping-card-heading">
                  <span className="mapping-index">{String(index + 1).padStart(2, "0")}</span>
                  <button className="button button-danger button-small" type="button"
                    onClick={() => setMappings((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    Xóa
                  </button>
                </div>
                <div className="mapping-fields">
                  <label>Mã biểu mẫu
                    <input value={mapping.id} placeholder="vi-du-form"
                      onChange={(event) => updateMapping(index, { id: event.target.value })} />
                  </label>
                  <label>Tên hiển thị
                    <input value={mapping.label} placeholder="Tên biểu mẫu"
                      onChange={(event) => updateMapping(index, { label: event.target.value })} />
                  </label>
                  <label className="field-wide">Mô tả
                    <input value={mapping.description} placeholder="Mô tả ngắn"
                      onChange={(event) => updateMapping(index, { description: event.target.value })} />
                  </label>
                  <label>File HTML
                    <select value={mapping.formFile}
                      onChange={(event) => updateMapping(index, { formFile: event.target.value })}>
                      {selectOptions(files?.forms ?? [], mapping.formFile)}
                    </select>
                  </label>
                  <label>File DOCX
                    <select value={mapping.templateFile}
                      onChange={(event) => updateMapping(index, { templateFile: event.target.value })}>
                      {selectOptions(files?.templates ?? [], mapping.templateFile)}
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
          <div className="config-actions">
            <button className="button button-outline" type="button" onClick={addMapping}>
              + Thêm liên kết
            </button>
            <div className="save-actions">
              {status && <span className="status-message" role="status">{status}</span>}
              <button className="button button-primary" type="button" disabled={busy} onClick={() => void submit()}>
                {busy ? "Đang lưu..." : "Lưu cấu hình"}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function selectOptions(files: string[], selected: string) {
  return (
    <>
      {selected && !files.includes(selected) && (
        <option value={selected}>{selected} (không tìm thấy)</option>
      )}
      {files.map((file) => <option key={file} value={file}>{file}</option>)}
    </>
  );
}

function FormPage({ templateId }: { templateId: string }) {
  const [definition, setDefinition] = useState<FormDefinition>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadForm(templateId).then((result) => {
      setDefinition(result);
      setValues(Object.fromEntries(result.fields.map((field) => [field.name, field.initialValue])));
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Không tải được biểu mẫu.");
    });
  }, [templateId]);

  const updateValue = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!definition) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new URLSearchParams();
      body.set("template", definition.template.id);
      body.set("outputFormat", "docx");
      for (const field of definition.fields) {
        body.append(field.name, values[field.name] ?? "");
      }
      const response = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) {
        const result: unknown = await response.json();
        const message = typeof result === "object" && result !== null &&
          "message" in result && typeof result.message === "string"
          ? result.message
          : "Không thể tạo file DOCX.";
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${definition.template.id}-generated.docx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo file DOCX.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !definition) {
    return <main className="page-shell"><a className="back-link" href="/">← Danh sách biểu mẫu</a><ErrorMessage>{error}</ErrorMessage></main>;
  }
  if (!definition) {
    return <main className="page-shell"><div className="loading-card">Đang tải biểu mẫu...</div></main>;
  }

  return (
    <main className="page-shell form-shell">
      <a className="back-link" href="/">← Danh sách biểu mẫu</a>
      <section className="form-card">
        <span className="eyebrow">BIỂU MẪU DOCX</span>
        <h1>{definition.title}</h1>
        {definition.description && <p className="form-description">{definition.description}</p>}
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            {definition.fields.map((field) => (
              <FormControl key={field.name} field={field}
                value={values[field.name] ?? ""}
                onChange={(value) => updateValue(field.name, value)} />
            ))}
          </div>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="form-submit">
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? "Đang tạo DOCX..." : "Tải file DOCX"}
              {!busy && <span aria-hidden="true">↓</span>}
            </button>
            <span className="form-footnote">Tệp sẽ được tạo và tải xuống ngay.</span>
          </div>
        </form>
      </section>
    </main>
  );
}

function FormControl({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange(value: string): void;
}) {
  const className = field.wide ? "form-field field-wide" : "form-field";
  if (field.kind === "textarea") {
    return (
      <label className={className}>{field.label}
        <textarea name={field.name} required={field.required} value={value}
          onChange={(event) => onChange(event.target.value)} rows={4} />
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <label className={className}>{field.label}
        <select name={field.name} required={field.required} value={value}
          onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className={className}>{field.label}
      <input name={field.name} type={field.inputType} required={field.required} value={value}
        onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/config") {
    return <ConfigPage />;
  }
  const formRoute = pathname.match(/^\/form\/([a-z0-9][a-z0-9-]*)$/);
  if (formRoute) {
    return <FormPage templateId={formRoute[1]} />;
  }
  return <HomePage />;
}
