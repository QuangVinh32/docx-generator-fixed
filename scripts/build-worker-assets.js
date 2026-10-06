const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");

fs.mkdirSync(output, { recursive: true });
fs.rmSync(path.join(output, "forms"), { recursive: true, force: true });
fs.cpSync(path.join(root, "forms"), path.join(output, "form-assets"), { recursive: true });
fs.cpSync(path.join(root, "templates"), path.join(output, "templates"), { recursive: true });
fs.mkdirSync(path.join(output, "config"), { recursive: true });
fs.copyFileSync(
  path.join(root, "config", "templates.json"),
  path.join(output, "config", "templates.json")
);

const listFiles = (directory, extension) =>
  fs.readdirSync(path.join(root, directory))
    .filter((file) => file.toLowerCase().endsWith(extension))
    .sort((left, right) => left.localeCompare(right));

fs.writeFileSync(
  path.join(output, "worker-manifest.json"),
  `${JSON.stringify({
    forms: listFiles("forms", ".html"),
    templates: listFiles("templates", ".docx"),
  })}\n`,
  "utf8"
);
