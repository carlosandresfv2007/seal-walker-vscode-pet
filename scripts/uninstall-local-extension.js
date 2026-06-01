const fs = require("fs");
const os = require("os");
const path = require("path");

const extensionId = "seal-walker-vscode-0.0.1";
const target = path.join(os.homedir(), ".vscode", "extensions", extensionId);

try {
  const stat = fs.lstatSync(target);
  if (!stat.isSymbolicLink()) {
    throw new Error(`${target} exists but is not a symlink. Remove it manually if needed.`);
  }

  fs.rmSync(target, { force: true });
  console.log(`Uninstalled Seal Walker local extension: ${target}`);
} catch (error) {
  if (error.code === "ENOENT") {
    console.log("Seal Walker local extension is not installed.");
  } else {
    throw error;
  }
}
