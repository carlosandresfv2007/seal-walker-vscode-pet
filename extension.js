const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");

const PID_FILE = path.join(os.tmpdir(), "seal-walker.pid");
const DEFAULT_SCALE = 0.38;
const MIN_SCALE = 0.15;
const MAX_SCALE = 1.4;
const SCALE_STEP = 0.05;

let petProcess;

function readPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getSealConfig() {
  const config = vscode.workspace.getConfiguration("sealWalker");

  return {
    launchOnStartup: config.get("launchOnStartup", true),
    scale: config.get("scale", DEFAULT_SCALE),
    speed: config.get("speed", 26),
    bottomMargin: config.get("bottomMargin", 0),
    walkDuration: config.get("walkDuration", 8500),
    walkFrameMs: config.get("walkFrameMs", 240),
    stepPauseMs: config.get("stepPauseMs", 420),
    walkMotionFrames: config.get("walkMotionFrames", 10),
    sleepFrameMs: config.get("sleepFrameMs", 150),
    tripleClickMs: config.get("tripleClickMs", 750),
    walkStartFrame: config.get("walkStartFrame", 2),
    framePadding: config.get("framePadding", 10),
    spriteColumns: config.get("spriteColumns", 4),
    spriteRows: config.get("spriteRows", 4)
  };
}

function getElectronPath() {
  const electron = require("electron");
  return typeof electron === "string" ? electron : electron.toString();
}

async function startSeal(context, source = "command") {
  const config = getSealConfig();
  if (source === "startup" && !config.launchOnStartup) {
    return;
  }

  const existingPid = readPid();
  if (isProcessAlive(existingPid)) {
    return;
  }

  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {
    // Best effort cleanup for stale process markers.
  }

  const electronPath = getElectronPath();
  const appMain = path.join(context.extensionPath, "pet-app", "main.js");
  const env = {
    ...process.env,
    SEAL_PET_PID_FILE: PID_FILE,
    SEAL_PET_CONFIG: JSON.stringify(config)
  };

  const args =
    process.platform === "linux"
      ? ["--no-sandbox", "--disable-gpu", "--ozone-platform=x11", appMain]
      : [appMain];

  petProcess = childProcess.spawn(electronPath, args, {
    cwd: context.extensionPath,
    detached: true,
    env,
    stdio: "ignore"
  });

  petProcess.unref();
}

async function stopSeal() {
  const pid = readPid();
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      vscode.window.showWarningMessage(`Could not stop the seal: ${error.message}`);
    }
  }

  if (petProcess && !petProcess.killed) {
    try {
      petProcess.kill("SIGTERM");
    } catch {
      // The PID file path handles the important case.
    }
  }

  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {
    // Best effort cleanup.
  }
}

async function restartSeal(context) {
  await stopSeal();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await startSeal(context, "command");
}

function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

async function updateScale(context, nextScale) {
  const config = vscode.workspace.getConfiguration("sealWalker");
  const scale = Number(clampScale(nextScale).toFixed(2));
  await config.update("scale", scale, vscode.ConfigurationTarget.Global);
  await restartSeal(context);
  vscode.window.showInformationMessage(`Seal size set to ${scale}.`);
}

async function nudgeScale(context, delta) {
  const config = vscode.workspace.getConfiguration("sealWalker");
  const current = config.get("scale", DEFAULT_SCALE);
  await updateScale(context, current + delta);
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("sealWalker.start", () => startSeal(context, "command")),
    vscode.commands.registerCommand("sealWalker.stop", stopSeal),
    vscode.commands.registerCommand("sealWalker.restart", () => restartSeal(context)),
    vscode.commands.registerCommand("sealWalker.smaller", () => nudgeScale(context, -SCALE_STEP)),
    vscode.commands.registerCommand("sealWalker.larger", () => nudgeScale(context, SCALE_STEP)),
    vscode.commands.registerCommand("sealWalker.resetSize", () => updateScale(context, DEFAULT_SCALE))
  );

  setTimeout(() => {
    startSeal(context, "startup").catch((error) => {
      vscode.window.showWarningMessage(`Could not start the seal: ${error.message}`);
    });
  }, 700);
}

function deactivate() {
  // Keep the seal alive while VS Code windows reload. Users can run Seal: Stop.
}

module.exports = {
  activate,
  deactivate
};
