(function () {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const config = {
    scale: 0.38,
    spriteColumns: 4,
    spriteRows: 4,
    framePadding: 10,
    walkFrameMs: 240,
    walkMotionFrames: 10,
    sleepFrameMs: 150,
    airFrameMs: 95,
    ...window.sealPet.config
  };

  const animations = {
    idle: [],
    turnToWalk: [],
    walk: [],
    stepPause: [],
    turnToIdle: [],
    sleepEnter: [],
    sleepIdle: [],
    sleepExit: [],
    airGrab: [],
    airCrashEnter: [],
    airCrashLoop: [],
    airRecover: []
  };

  const state = {
    mode: "idle",
    direction: -1,
    frameIndex: 0,
    frameTimer: 0,
    dragging: false,
    pointerDown: false,
    pointerId: undefined,
    pointerStartX: 0,
    pointerStartY: 0,
    dragStarted: false,
    lastTime: performance.now(),
    endedMode: undefined
  };

  let ready = false;
  let stageWidth = 1;
  let stageHeight = 1;

  function resizeCanvas(width, height) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function loadFirst(paths) {
    let lastError;
    for (const src of paths) {
      try {
        return await loadImage(src);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  function makeTransparent(canvasElement) {
    const frameCtx = canvasElement.getContext("2d");
    const image = frameCtx.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const data = image.data;
    const { width, height } = canvasElement;
    const visited = new Uint8Array(width * height);
    const stack = [];

    function isBackground(index) {
      const offset = index * 4;
      return Math.max(data[offset], data[offset + 1], data[offset + 2]) < 34;
    }

    function pushIfBackground(index) {
      if (index < 0 || index >= visited.length || visited[index] || !isBackground(index)) {
        return;
      }

      visited[index] = 1;
      stack.push(index);
    }

    for (let x = 0; x < width; x += 1) {
      pushIfBackground(x);
      pushIfBackground((height - 1) * width + x);
    }

    for (let y = 0; y < height; y += 1) {
      pushIfBackground(y * width);
      pushIfBackground(y * width + width - 1);
    }

    while (stack.length > 0) {
      const index = stack.pop();
      const x = index % width;
      data[index * 4 + 3] = 0;

      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (neighbor < 0 || neighbor >= visited.length) {
          continue;
        }

        const nx = neighbor % width;
        if (Math.abs(nx - x) > 1) {
          continue;
        }

        pushIfBackground(neighbor);
      }
    }

    frameCtx.putImageData(image, 0, 0);
  }

  function getVisibleBounds(canvasElement) {
    const frameCtx = canvasElement.getContext("2d");
    const { width, height } = canvasElement;
    const image = frameCtx.getImageData(0, 0, width, height);
    const data = image.data;
    const visited = new Uint8Array(width * height);
    let best = { x: 0, y: 0, width, height, area: 0 };

    function isOpaque(index) {
      return data[index * 4 + 3] > 12;
    }

    function inspectComponent(startIndex) {
      const stack = [startIndex];
      visited[startIndex] = 1;
      let area = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      while (stack.length > 0) {
        const index = stack.pop();
        const x = index % width;
        const y = Math.floor(index / width);

        area += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
          if (neighbor < 0 || neighbor >= visited.length || visited[neighbor] || !isOpaque(neighbor)) {
            continue;
          }

          const nx = neighbor % width;
          if (Math.abs(nx - x) > 1) {
            continue;
          }

          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }

      return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area };
    }

    for (let index = 0; index < visited.length; index += 1) {
      if (visited[index]) {
        continue;
      }

      if (!isOpaque(index)) {
        visited[index] = 1;
        continue;
      }

      const component = inspectComponent(index);
      if (component.area > best.area) {
        best = component;
      }
    }

    if (best.area === 0) {
      return { x: 0, y: 0, width, height };
    }

    return best;
  }

  function extractFrames(image) {
    const columns = Math.max(1, Math.round(config.spriteColumns));
    const rows = Math.max(1, Math.round(config.spriteRows));
    const frames = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const sx = Math.floor((column * image.naturalWidth) / columns);
        const sy = Math.floor((row * image.naturalHeight) / rows);
        const ex = Math.floor(((column + 1) * image.naturalWidth) / columns);
        const ey = Math.floor(((row + 1) * image.naturalHeight) / rows);
        const raw = document.createElement("canvas");
        const rawCtx = raw.getContext("2d");

        raw.width = ex - sx;
        raw.height = ey - sy;
        rawCtx.drawImage(image, sx, sy, raw.width, raw.height, 0, 0, raw.width, raw.height);
        makeTransparent(raw);

        const bounds = getVisibleBounds(raw);
        const frame = document.createElement("canvas");
        const frameCtx = frame.getContext("2d");

        frame.width = bounds.width;
        frame.height = bounds.height;
        frameCtx.drawImage(
          raw,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          0,
          0,
          bounds.width,
          bounds.height
        );

        frames.push(frame);
      }
    }

    return frames;
  }

  function getFramesForMode() {
    if (state.mode === "turnToWalk") {
      return animations.turnToWalk;
    }

    if (state.mode === "walk") {
      return animations.walk;
    }

    if (state.mode === "stepPause") {
      return animations.stepPause;
    }

    if (state.mode === "turnToIdle") {
      return animations.turnToIdle;
    }

    if (state.mode === "sleepEnter") {
      return animations.sleepEnter;
    }

    if (state.mode === "sleepIdle") {
      return animations.sleepIdle;
    }

    if (state.mode === "sleepExit") {
      return animations.sleepExit;
    }

    if (state.mode === "airGrab" || state.mode === "airFall") {
      return animations.airGrab;
    }

    if (state.mode === "airCrashEnter") {
      return animations.airCrashEnter;
    }

    if (state.mode === "airCrashLoop") {
      return animations.airCrashLoop;
    }

    if (state.mode === "airRecover") {
      return animations.airRecover;
    }

    return animations.idle;
  }

  function frameDurationForMode() {
    if (state.mode === "walk") {
      return config.walkFrameMs;
    }

    if (state.mode === "sleepEnter" || state.mode === "sleepExit") {
      return config.sleepFrameMs;
    }

    if (state.mode === "airCrashEnter") {
      return Math.max(40, Math.round(config.airFrameMs * 0.55));
    }

    if (
      state.mode === "airGrab" ||
      state.mode === "airFall" ||
      state.mode === "airCrashLoop" ||
      state.mode === "airRecover"
    ) {
      return config.airFrameMs;
    }

    if (state.mode === "turnToWalk" || state.mode === "turnToIdle") {
      return 95;
    }

    return 250;
  }

  function currentFrame() {
    const frames = getFramesForMode();
    return frames[Math.min(state.frameIndex, frames.length - 1)] || animations.idle[0];
  }

  function publishWalkMotion() {
    const active =
      state.mode === "walk" &&
      state.frameIndex < Math.max(1, Math.round(config.walkMotionFrames));
    window.sealPet.walkMotion(active);
  }

  function draw() {
    ctx.clearRect(0, 0, stageWidth, stageHeight);

    const frame = currentFrame();
    if (!frame) {
      return;
    }

    const width = Math.round(frame.width * config.scale);
    const height = Math.round(frame.height * config.scale);
    const x = Math.round((stageWidth - width) / 2);
    const y = stageHeight - height;

    ctx.save();
    if (state.direction < 0) {
      ctx.translate(stageWidth - x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, 0, 0, width, height);
    } else {
      ctx.drawImage(frame, x, y, width, height);
    }
    ctx.restore();
  }

  function advanceAnimation(dt) {
    const frames = getFramesForMode();
    if (
      frames.length <= 1 ||
      state.mode === "idle" ||
      state.mode === "stepPause" ||
      state.mode === "sleepIdle" ||
      state.mode === "airCrashLoop"
    ) {
      if (state.mode === "airCrashLoop") {
        state.frameTimer += dt * 1000;
        if (state.frameTimer >= frameDurationForMode()) {
          state.frameTimer = 0;
          state.frameIndex = frames.length > 0 ? (state.frameIndex + 1) % frames.length : 0;
        }
      }
      return;
    }

    state.frameTimer += dt * 1000;
    if (state.frameTimer < frameDurationForMode()) {
      return;
    }

    state.frameTimer = 0;

    if (state.mode === "walk") {
      if (state.frameIndex < frames.length - 1) {
        state.frameIndex += 1;
        publishWalkMotion();
        return;
      }

      if (state.endedMode !== state.mode) {
        window.sealPet.walkMotion(false);
        state.endedMode = state.mode;
        window.sealPet.animationEnded(state.mode);
      }
      return;
    }

    if (state.mode === "airGrab" || state.mode === "airFall") {
      if (state.frameIndex < frames.length - 1) {
        state.frameIndex += 1;
      } else {
        state.frameIndex = Math.min(4, frames.length - 1);
      }
      return;
    }

    if (state.frameIndex < frames.length - 1) {
      state.frameIndex += 1;
      return;
    }

    if (state.endedMode !== state.mode) {
      window.sealPet.walkMotion(false);
      state.endedMode = state.mode;
      window.sealPet.animationEnded(state.mode);
    }
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - state.lastTime) / 1000);
    state.lastTime = now;

    if (ready) {
      advanceAnimation(dt);
      draw();
    }

    requestAnimationFrame(tick);
  }

  window.sealPet.onState((nextState) => {
    const previousMode = state.mode;
    state.mode = nextState.mode || state.mode;
    state.direction = Number.isFinite(nextState.direction) ? nextState.direction : state.direction;

    const keepAirFrame = previousMode === "airGrab" && state.mode === "airFall";

    if (previousMode !== state.mode) {
      state.frameIndex = 0;
      state.frameTimer = 0;
      state.endedMode = undefined;
      if (keepAirFrame) {
        state.frameIndex = Math.min(4, getFramesForMode().length - 1);
      }
      publishWalkMotion();
      document.body.classList.toggle("dragging", state.mode === "airGrab");
    }
  });

  window.addEventListener("pointerdown", (event) => {
    state.pointerDown = true;
    state.pointerId = event.pointerId;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;
    state.dragStarted = false;
    canvas.setPointerCapture(event.pointerId);
  });

  window.addEventListener("pointermove", (event) => {
    if (!state.pointerDown || state.dragStarted) {
      return;
    }

    const dx = event.clientX - state.pointerStartX;
    const dy = event.clientY - state.pointerStartY;
    if (Math.hypot(dx, dy) < 5) {
      return;
    }

    state.dragStarted = true;
    state.dragging = true;
    document.body.classList.add("dragging");
    window.sealPet.pointerDown({ x: state.pointerStartX, y: state.pointerStartY });
  });

  window.addEventListener("pointerup", (event) => {
    const wasDrag = state.dragStarted;
    state.pointerDown = false;
    state.pointerId = undefined;
    state.dragStarted = false;
    document.body.classList.remove("dragging");
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released if the window moved.
    }
    if (wasDrag || state.dragging) {
      state.dragging = false;
      window.sealPet.pointerUp();
    } else {
      window.sealPet.click();
    }
  });

  async function start() {
    const turnToWalk = await loadImage("../assets/sprites/girar-izquierda.png");
    const walk = await loadImage("../assets/sprites/caminar-izquierda.png");
    const sleep = await loadImage("../assets/sprites/dormir.png");
    const airGrab = await loadImage("../assets/sprites/foca-aire.png");
    const airCrash = await loadImage("../assets/sprites/caida-aire.png");
    const airRecover = await loadImage("../assets/sprites/recuperacion-aire.png");
    const turnToIdle = await loadFirst([
      "../assets/sprites/girar-despues-caminar.png",
      "../assets/sprites/giarar-despues-caminar.png"
    ]);

    const turnToWalkFrames = extractFrames(turnToWalk);
    animations.walk = extractFrames(walk);
    animations.sleepEnter = extractFrames(sleep);
    animations.sleepExit = [...animations.sleepEnter].reverse();
    animations.sleepIdle = [animations.sleepEnter[animations.sleepEnter.length - 1]];
    animations.airGrab = extractFrames(airGrab);
    const airCrashFrames = extractFrames(airCrash);
    animations.airCrashEnter = airCrashFrames.slice(0, 4);
    animations.airCrashLoop = airCrashFrames.slice(4);
    animations.airRecover = extractFrames(airRecover);
    animations.turnToIdle = extractFrames(turnToIdle);
    animations.idle = [animations.turnToIdle[animations.turnToIdle.length - 1]];
    animations.turnToWalk = [animations.idle[0], ...turnToWalkFrames.slice(1)];
    animations.stepPause = [animations.walk[0]];

    const allFrames = [
      ...animations.turnToWalk,
      ...animations.walk,
      ...animations.stepPause,
      ...animations.turnToIdle,
      ...animations.sleepEnter,
      ...animations.sleepExit,
      ...animations.sleepIdle,
      ...animations.airGrab,
      ...animations.airCrashEnter,
      ...animations.airCrashLoop,
      ...animations.airRecover,
      ...animations.idle
    ];
    const padding = Math.max(0, Math.round(config.framePadding));
    const maxWidth = Math.max(...allFrames.map((frame) => frame.width));
    const maxHeight = Math.max(...allFrames.map((frame) => frame.height));

    stageWidth = Math.round((maxWidth + padding * 2) * config.scale);
    stageHeight = Math.round((maxHeight + padding) * config.scale);
    resizeCanvas(stageWidth, stageHeight);
    window.sealPet.ready({ width: stageWidth, height: stageHeight });
    ready = true;
  }

  start().catch((error) => {
    console.error(error);
  });

  requestAnimationFrame(tick);
})();
