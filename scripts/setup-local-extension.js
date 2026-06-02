const childProcess = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

console.log("Installing dependencies...");
run(npmCommand, ["install"]);

console.log("Checking extension files...");
run(npmCommand, ["run", "check"]);

console.log("Installing Seal Walker in VS Code...");
run(npmCommand, ["run", "install-local"]);

console.log("");
console.log("Seal Walker is installed.");
console.log("Close and reopen VS Code. The seal will start automatically after VS Code finishes launching.");
