const { contextBridge, ipcRenderer } = require("electron");

function readConfig() {
  try {
    return JSON.parse(process.env.SEAL_PET_CONFIG || "{}");
  } catch {
    return {};
  }
}

contextBridge.exposeInMainWorld("sealPet", {
  config: readConfig(),
  ready(size) {
    ipcRenderer.send("seal:ready", size);
  },
  pointerDown(point) {
    ipcRenderer.send("seal:pointer-down", point);
  },
  pointerUp() {
    ipcRenderer.send("seal:pointer-up");
  },
  click() {
    ipcRenderer.send("seal:click");
  },
  animationEnded(mode) {
    ipcRenderer.send("seal:animation-ended", mode);
  },
  walkMotion(active) {
    ipcRenderer.send("seal:walk-motion", Boolean(active));
  },
  onState(callback) {
    ipcRenderer.on("seal:state", (_event, state) => callback(state));
  }
});
