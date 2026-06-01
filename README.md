# Seal Walker

Seal Walker is a local VS Code extension that launches a small animated seal as a transparent Electron window. The seal walks along the bottom of the screen, can be dragged around, falls smoothly when released, and can sleep or wake up with triple-click interactions.


<img width="284" height="188" alt="image" src="https://github.com/user-attachments/assets/276beb9a-9e5e-4e61-9910-078b2a44add9" />
<img width="284" height="188" alt="image" src="https://github.com/user-attachments/assets/5bbb5f8a-9b8d-49b3-a83f-340ecbb4624b" />
<img width="238" height="160" alt="image" src="https://github.com/user-attachments/assets/04c53bb7-5b3e-4a44-9a92-ea586f5d3427" />


## Features

- Starts automatically when VS Code finishes launching.
- Walks in random step rounds: turns, takes a random number of steps with pauses, then turns back to idle.
- Bounces when it reaches the screen edges.
- Can be grabbed and dragged anywhere on the screen.
- Falls smoothly back to the floor when released.
- Triple-click to sleep.
- Triple-click while sleeping to wake up.
- Uses PNG spritesheets laid out as a `4x4` grid by default.
- Size can be changed from VS Code commands or settings.

## Architecture

This project uses a hybrid approach:

- `extension.js`: VS Code extension entrypoint. It registers commands, reads settings, and launches the Electron pet app.
- `pet-app/main.js`: Electron main process. It owns the transparent window, screen position, movement, gravity, clicks, and high-level state transitions.
- `pet-app/renderer.js`: Renderer process. It loads spritesheets, extracts animation frames, removes black backgrounds, draws the seal, and reports animation events back to the main process.
- `pet-app/preload.js`: Safe IPC bridge between the renderer and Electron main process.
- `assets/sprites/`: PNG spritesheets used by the seal.
- `scripts/`: helper scripts to install or uninstall the extension locally in VS Code.

The seal is not implemented as a pure VS Code webview because VS Code extensions cannot freely draw a floating desktop companion over the editor window. The extension therefore launches a transparent Electron window.

## Project Structure

```text
.
├── assets/
│   └── sprites/
│       ├── caminar-izquierda.png
│       ├── dormir.png
│       ├── giarar-despues-caminar.png
│       └── girar-izquierda.png
├── pet-app/
│   ├── index.html
│   ├── main.js
│   ├── preload.js
│   ├── renderer.js
│   └── styles.css
├── scripts/
│   ├── install-local-extension.js
│   └── uninstall-local-extension.js
├── extension.js
├── package.json
└── README.md
```

## Install From GitHub

Requirements:

- VS Code.
- Node.js and npm.
- Linux is currently the primary target. The Electron launch command includes Linux-friendly flags: `--no-sandbox`, `--disable-gpu`, and `--ozone-platform=x11`.

Steps:

```bash
git clone <REPOSITORY_URL>
cd seal-walker-vscode-pet
npm install
npm run check
npm run install-local
```

Then close and reopen VS Code. The seal should appear automatically.

To uninstall the local extension:

```bash
npm run uninstall-local
```

## Development

Run only the Electron pet app:

```bash
npm run pet
```

Test as a VS Code extension:

1. Open this folder in VS Code.
2. Press `F5`.
3. VS Code opens an Extension Development Host window.
4. The seal starts after that window finishes launching.

## VS Code Commands

Open the command palette with `Ctrl+Shift+P` and search for:

- `Seal: Start`
- `Seal: Stop`
- `Seal: Restart`
- `Seal: Smaller`
- `Seal: Larger`
- `Seal: Reset Size`

## Settings

Search for `Seal Walker` in VS Code settings.

Available settings:

- `sealWalker.launchOnStartup`: launch the seal when VS Code starts.
- `sealWalker.scale`: visual size of the seal.
- `sealWalker.speed`: horizontal movement speed.
- `sealWalker.bottomMargin`: distance from the bottom edge of the screen.
- `sealWalker.idleMinMs`: minimum time spent in idle before walking.
- `sealWalker.idleMaxMs`: maximum time spent in idle before walking.
- `sealWalker.walkMinSteps`: minimum random number of steps in one walking round.
- `sealWalker.walkMaxSteps`: maximum random number of steps in one walking round.
- `sealWalker.walkFrameMs`: duration of each walking frame.
- `sealWalker.stepPauseMs`: pause between step animations.
- `sealWalker.walkMotionFrames`: number of leading walk frames that move the window during each step.
- `sealWalker.sleepFrameMs`: speed of the sleep and wake-up animations.
- `sealWalker.tripleClickMs`: time window for detecting triple clicks.
- `sealWalker.spriteColumns` and `sealWalker.spriteRows`: spritesheet grid size.

## Sprites

Sprites are stored in `assets/sprites/`.

Current files:

- `girar-izquierda.png`: turn from idle into walking.
- `caminar-izquierda.png`: walking step animation.
- `giarar-despues-caminar.png`: turn from walking back to idle. The filename currently has a typo; the app also tries `girar-despues-caminar.png` if you rename it later.
- `dormir.png`: sleep animation. Wake-up uses the same frames in reverse order.

Expected format:

- PNG.
- Black or transparent background.
- `4x4` grid by default.
- Frames are read left to right, top to bottom.

## Git Hygiene

The repository should include source code, configuration, and sprite assets. It should not include dependencies or generated local artifacts.

Ignored by default:

- `node_modules/`
- `*.vsix`
- `.vscode-test/`
- `dist/`, `out/`, `build/`, `release/`
- logs and common local temporary files

After cloning on another machine, run `npm install`. Do not commit `node_modules`.
