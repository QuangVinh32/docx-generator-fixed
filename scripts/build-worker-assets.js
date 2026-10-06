const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "worker-assets");

for (const directory of ["config", "forms", "templates"]) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), { recursive: true });
}

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
