const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");

app.disableHardwareAcceleration();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const config = readConfig();
let window;
let loopHandle;
let lastTick = Date.now();

const state = {
  ready: false,
  x: 0,
  y: 0,
  width: 260,
  height: 220,
  direction: -1,
  mode: "idle",
  modeTimer: 1600,
  walkStepsRemaining: 0,
  walkMotionActive: false,
  velocityY: 0,
  dragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  clickCount: 0,
  lastClickAt: 0
};

function readConfig() {
  try {
    return {
      scale: 0.38,
      speed: 26,
      bottomMargin: 0,
      idleMinMs: 4000,
      idleMaxMs: 11000,
      walkMinSteps: 1,
      walkMaxSteps: 6,
      walkFrameMs: 240,
      stepPauseMs: 420,
      walkMotionFrames: 10,
      sleepFrameMs: 150,
      airFrameMs: 95,
      impactLoopFrameMs: 180,
      tripleClickMs: 750,
      spriteColumns: 4,
      spriteRows: 4,
      walkStartFrame: 2,
      framePadding: 10,
      ...JSON.parse(process.env.SEAL_PET_CONFIG || "{}")
    };
  } catch {
    return {
      scale: 0.38,
      speed: 26,
      bottomMargin: 0,
      idleMinMs: 4000,
      idleMaxMs: 11000,
      walkMinSteps: 1,
      walkMaxSteps: 6,
      walkFrameMs: 240,
      stepPauseMs: 420,
      walkMotionFrames: 10,
      sleepFrameMs: 150,
      airFrameMs: 95,
      impactLoopFrameMs: 180,
      tripleClickMs: 750,
      spriteColumns: 4,
      spriteRows: 4,
      walkStartFrame: 2,
      framePadding: 10
    };
  }
}

function getPidFile() {
  return process.env.SEAL_PET_PID_FILE;
}

function writePidFile() {
  const pidFile = getPidFile();
  if (!pidFile) {
    return;
  }

  try {
    fs.writeFileSync(pidFile, String(process.pid), "utf8");
  } catch {
    // If the marker cannot be written, the app can still run.
  }
}

function removePidFile() {
  const pidFile = getPidFile();
  if (!pidFile) {
    return;
  }

  try {
    fs.rmSync(pidFile, { force: true });
  } catch {
    // Best effort cleanup.
  }
}

function getWorkArea() {
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor).bounds;
}

function getFloorY() {
  const area = getWorkArea();
  return area.y + area.height - config.bottomMargin - state.height;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.random() * (high - low);
}

function randomIntInclusive(min, max) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function createWindow() {
  const area = getWorkArea();

  window = new BrowserWindow({
    x: Math.round(area.x + (area.width - state.width) / 2),
    y: Math.round(area.y + area.height - config.bottomMargin - state.height),
    width: state.width,
    height: state.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.loadFile(path.join(__dirname, "index.html"));
}

function sendState() {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send("seal:state", {
    mode: state.mode,
    direction: state.direction
  });
}

function setMode(mode) {
  if (state.mode === mode) {
    return;
  }

  state.mode = mode;
  sendState();
}

function beginIdle() {
  setMode("idle");
  state.modeTimer = randomBetween(config.idleMinMs, config.idleMaxMs);
  state.walkStepsRemaining = 0;
  state.walkMotionActive = false;
}

function beginSleepEnter() {
  state.walkStepsRemaining = 0;
  state.walkMotionActive = false;
  state.clickCount = 0;
  state.lastClickAt = 0;
  state.modeTimer = 0;
  setMode("sleepEnter");
}

function beginAirCrashEnter() {
  state.walkStepsRemaining = 0;
  state.walkMotionActive = false;
  state.velocityY = 0;
  state.modeTimer = 0;
  setMode("airCrashEnter");
}

function beginAirCrashLoop() {
  state.walkStepsRemaining = 0;
  state.walkMotionActive = false;
  state.velocityY = 0;
  state.modeTimer = 0;
  setMode("airCrashLoop");
}

function beginAirRecover() {
  state.walkStepsRemaining = 0;
  state.walkMotionActive = false;
  state.velocityY = 0;
  state.modeTimer = 0;
  setMode("airRecover");
}

function beginSleepIdle() {
  state.walkStepsRemaining = 0;
  state.walkMotionActive = false;
  state.modeTimer = 0;
  setMode("sleepIdle");
}

function beginSleepExit() {
  state.walkStepsRemaining = 0;
  state.walkMotionActive = false;
  state.clickCount = 0;
  state.lastClickAt = 0;
  state.modeTimer = 0;
  setMode("sleepExit");
}

function beginWalkStep() {
  state.walkMotionActive = true;
  setMode("walk");
  state.modeTimer = 0;
}

function beginStepPause() {
  state.walkMotionActive = false;
  setMode("stepPause");
  state.modeTimer = config.stepPauseMs;
}

function beginTurnToWalk() {
  state.walkMotionActive = false;
  state.walkStepsRemaining = randomIntInclusive(config.walkMinSteps, config.walkMaxSteps);
  state.direction = Math.random() < 0.5 ? -1 : 1;
  setMode("turnToWalk");
  state.modeTimer = 0;
}

function beginTurnToIdle() {
  state.walkMotionActive = false;
  setMode("turnToIdle");
  state.modeTimer = 0;
}

function moveWindow() {
  if (!window || window.isDestroyed() || !state.ready) {
    return;
  }

  window.setBounds({
    x: Math.round(state.x),
    y: Math.round(state.y),
    width: state.width,
    height: state.height
  });
}

function keepInsideWorkArea() {
  const area = getWorkArea();
  state.x = clamp(state.x, area.x, area.x + area.width - state.width);
  state.y = clamp(state.y, area.y, area.y + area.height - state.height);
}

function tick() {
  const now = Date.now();
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;

  if (!state.ready) {
    return;
  }

  const area = getWorkArea();
  const floorY = getFloorY();

  if (state.dragging) {
    const cursor = screen.getCursorScreenPoint();
    state.x = clamp(cursor.x - state.dragOffsetX, area.x, area.x + area.width - state.width);
    state.y = clamp(cursor.y - state.dragOffsetY, area.y, area.y + area.height - state.height);
    moveWindow();
    return;
  }

  if (state.mode === "airFall") {
    state.velocityY += 1900 * dt;
    state.y += state.velocityY * dt;

    if (state.y >= floorY) {
      state.y = floorY;
      state.velocityY = 0;
      beginAirCrashEnter();
    }

    moveWindow();
    return;
  }

  if (
    state.mode === "sleepEnter" ||
    state.mode === "sleepIdle" ||
    state.mode === "sleepExit" ||
    state.mode === "airGrab" ||
    state.mode === "airCrashEnter" ||
    state.mode === "airCrashLoop" ||
    state.mode === "airRecover"
  ) {
    return;
  }

  if (state.mode === "idle" || state.mode === "stepPause") {
    state.modeTimer -= dt * 1000;
  }

  if (state.modeTimer <= 0) {
    if (state.mode === "idle") {
      beginTurnToWalk();
    } else if (state.mode === "stepPause") {
      if (state.walkStepsRemaining <= 0) {
        beginTurnToIdle();
      } else {
        beginWalkStep();
      }
    }
  }

  if (state.mode === "walk") {
    if (state.walkMotionActive) {
      state.x += state.direction * config.speed * dt;
    }

    if (state.x <= area.x) {
      state.x = area.x;
      state.direction = 1;
      sendState();
    } else if (state.x + state.width >= area.x + area.width) {
      state.x = area.x + area.width - state.width;
      state.direction = -1;
      sendState();
    }

    state.y = floorY;
    moveWindow();
  }
}

app.whenReady().then(() => {
  writePidFile();
  createWindow();
  loopHandle = setInterval(tick, 16);
});

app.on("second-instance", () => {
  if (window) {
    window.showInactive();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (loopHandle) {
    clearInterval(loopHandle);
  }
  removePidFile();
});

process.on("SIGTERM", () => {
  removePidFile();
  app.quit();
});

ipcMain.on("seal:ready", (_event, size) => {
  if (!window || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    return;
  }

  const area = getWorkArea();
  state.width = Math.round(size.width);
  state.height = Math.round(size.height);
  state.x = Math.round(area.x + (area.width - state.width) / 2);
  state.y = getFloorY();
  state.ready = true;
  keepInsideWorkArea();
  moveWindow();
  beginIdle();
});

ipcMain.on("seal:pointer-down", (_event, point) => {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return;
  }

  if (
    state.mode === "sleepEnter" ||
    state.mode === "sleepIdle" ||
    state.mode === "sleepExit" ||
    state.mode === "airCrashEnter" ||
    state.mode === "airCrashLoop" ||
    state.mode === "airRecover"
  ) {
    return;
  }

  state.dragging = true;
  state.dragOffsetX = point.x;
  state.dragOffsetY = point.y;
  state.velocityY = 0;
  state.walkMotionActive = false;
  setMode("airGrab");
});

ipcMain.on("seal:pointer-up", () => {
  if (!state.dragging) {
    return;
  }

  state.dragging = false;
  state.velocityY = 0;
  setMode("airFall");
});

ipcMain.on("seal:animation-ended", (_event, mode) => {
  if (state.dragging || state.mode !== mode) {
    return;
  }

  if (mode === "turnToWalk") {
    beginWalkStep();
  } else if (mode === "walk") {
    state.walkStepsRemaining -= 1;
    if (state.walkStepsRemaining <= 0) {
      beginTurnToIdle();
    } else {
      beginStepPause();
    }
  } else if (mode === "turnToIdle") {
    beginIdle();
  } else if (mode === "sleepEnter") {
    beginSleepIdle();
  } else if (mode === "sleepExit") {
    beginIdle();
  } else if (mode === "airCrashEnter") {
    beginAirCrashLoop();
  } else if (mode === "airRecover") {
    beginIdle();
  }
});

ipcMain.on("seal:walk-motion", (_event, active) => {
  state.walkMotionActive = Boolean(active);
});

ipcMain.on("seal:click", () => {
  if (state.mode === "airCrashEnter" || state.mode === "airCrashLoop") {
    state.clickCount = 0;
    state.lastClickAt = 0;
    beginAirRecover();
    return;
  }

  if (state.mode === "airRecover" || state.mode === "airGrab" || state.mode === "airFall") {
    return;
  }

  const now = Date.now();
  const withinWindow = now - state.lastClickAt <= config.tripleClickMs;

  state.clickCount = withinWindow ? state.clickCount + 1 : 1;
  state.lastClickAt = now;

  if (state.clickCount < 3) {
    return;
  }

  state.clickCount = 0;
  state.lastClickAt = 0;

  if (state.mode === "sleepIdle" || state.mode === "sleepEnter") {
    beginSleepExit();
    return;
  }

  if (state.mode === "sleepExit") {
    return;
  }

  beginSleepEnter();
});
