const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const extensionId = "seal-walker-vscode-0.0.1";
const extensionsDir = path.join(os.homedir(), ".vscode", "extensions");
const target = path.join(extensionsDir, extensionId);

fs.mkdirSync(extensionsDir, { recursive: true });

try {
  const stat = fs.lstatSync(target);
  if (!stat.isSymbolicLink()) {
    throw new Error(`${target} already exists and is not a symlink.`);
  }

  fs.rmSync(target, { force: true });
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

fs.symlinkSync(root, target, "dir");
console.log(`Installed Seal Walker as a local VS Code extension: ${target}`);
