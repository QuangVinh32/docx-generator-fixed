export type TemplateOption = {
  id: string;
  label: string;
  description: string;
  formFile: string;
  templateFile: string;
};

export type AvailableFiles = {
  forms: string[];
  templates: string[];
};

export type FormField = {
  name: string;
  label: string;
  kind: "input" | "textarea" | "select";
  inputType: string;
  required: boolean;
  initialValue: string;
  wide: boolean;
  options: { value: string; label: string }[];
};

export type FormDefinition = {
  template: TemplateOption;
  title: string;
  description: string;
  fields: FormField[];
};
