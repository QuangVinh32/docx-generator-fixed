const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const commands = [
  { name: "api", args: ["--import", "tsx", "src/index.ts"] },
  {
    name: "web",
    args: [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "0.0.0.0"],
  },
];

const children = commands.map(({ name, args }) => {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  child.on("error", (error) => {
    console.error(`${name} development process failed:`, error);
    stopChildren(child);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      process.exitCode = code ?? 1;
      stopChildren(child);
    }
  });
  return child;
});

function stopChildren(exitedChild) {
  for (const child of children) {
    if (child !== exitedChild && child.exitCode === null) {
      child.kill();
    }
  }
}

process.on("SIGINT", () => stopChildren());
process.on("SIGTERM", () => stopChildren());
