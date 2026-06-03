/*
Real Two-Finger Pimple Pop
GitHub Pages compatible.
No external libraries.
Important design change:
- Mouse can only test one finger, but real scoring needs two touch points.
- On mobile, the player places two fingers on both sides of the selected pimple.
- The game measures inward movement from both fingers.
- Pus flow is not constant. It is strong at the beginning, then naturally gets weaker as pressure releases.
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const poppedEl = document.getElementById("popped");
const comboEl = document.getElementById("combo");
const pressureBar = document.getElementById("pressureBar");
const pusBar = document.getElementById("pusBar");
const positionBar = document.getElementById("positionBar");
const messageEl = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const world = {
  w: 1200,
  h: 1700
};

let view = {
  x: world.w / 2,
  y: world.h / 2,
  scale: 0.55,
  targetX: world.w / 2,
  targetY: world.h / 2,
  targetScale: 0.55
};

let cameraShake = 0;
let time = 0;
let lastFrame = performance.now();
let score = 0;
let combo = 1;
let selected = null;
let selectedId = null;
let state = "overview"; // overview, focused, squeezing, success, hurt
let messageTimer = 0;

const pointers = new Map();
let pinchStart = null;
let mouseDown = false;

const game = {
  pimples: [],
  particles: [],
  streams: [],
  splats: [],
  rings: [],
  fingers: [],
  faceMood: 0,
  popped: 0
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * DPR));
  canvas.height = Math.max(1, Math.floor(rect.height * DPR));
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist(a, b, c, d) {
  const dx = a - c;
  const dy = b - d;
  return Math.sqrt(dx * dx + dy * dy);
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  const x = sx - rect.left;
  const y = sy - rect.top;
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  return {
    x: view.x + (x - cx) / view.scale,
    y: view.y + (y - cy) / view.scale
  };
}

function worldToScreen(wx, wy) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width / 2 + (wx - view.x) * view.scale,
    y: rect.height / 2 + (wy - view.y) * view.scale
  };
}

function setMessage(text, seconds = 2.0) {
  messageEl.textContent = text;
  messageTimer = seconds;
}

function updateUi() {
  scoreEl.textContent = Math.floor(score).toString();
  poppedEl.textContent = game.popped.toString();
  comboEl.textContent = "x" + combo.toString();
}

function createPimples() {
  const data = [
    { x: 430, y: 555, r: 20, size: "small" },
    { x: 758, y: 590, r: 19, size: "small" },
    { x: 598, y: 1015, r: 20, size: "small" },
    { x: 500, y: 760, r: 28, size: "medium" },
    { x: 695, y: 790, r: 31, size: "medium" },
    { x: 610, y: 1185, r: 29, size: "medium" },
    { x: 386, y: 965, r: 43, size: "big" },
    { x: 800, y: 975, r: 47, size: "big" },
    { x: 610, y: 675, r: 45, size: "big" }
  ];

  game.pimples = data.map((p, i) => ({
    ...p,
    id: i,
    pus: 1,
    pressure: 0,
    inflammation: 0.25,
    popped: false,
    damaged: false,
    squeeze: null,
    irregular: Array.from({ length: 18 }, (_, k) => {
      const a = (k / 18) * Math.PI * 2;
      return {
        a,
        m: rand(0.82, 1.22)
      };
    }),
    pores: Array.from({ length: 16 }, () => ({
      a: rand(0, Math.PI * 2),
      d: rand(0.25, 0.9),
      r: rand(0.6, 1.8)
    }))
  }));
}

function resetGame() {
  score = 0;
  combo = 1;
  selected = null;
  selectedId = null;
  state = "overview";
  game.popped = 0;
  game.particles.length = 0;
  game.streams.length = 0;
  game.splats.length = 0;
  game.rings.length = 0;
  game.fingers.length = 0;
  game.faceMood = 0;
  view.x = world.w / 2;
  view.y = world.h / 2;
  view.scale = 0.55;
  view.targetX = view.x;
  view.targetY = view.y;
  view.targetScale = view.scale;
  createPimples();
  setMessage("Tap a pimple. Then use two fingers and move both inward.", 4);
  updateUi();
}
resetBtn.addEventListener("click", resetGame);
zoomOutBtn.addEventListener("click", () => {
  selected = null;
  selectedId = null;
  state = "overview";
  view.targetX = world.w / 2;
  view.targetY = world.h / 2;
  view.targetScale = 0.55;
  setMessage("Zoomed out. Tap another pimple.", 1.5);
});

function focusPimple(p) {
  if (!p || p.popped) return;
  selected = p;
  selectedId = p.id;
  state = "focused";
  p.squeeze = null;
  view.targetX = p.x;
  view.targetY = p.y;
  view.targetScale = p.size === "big" ? 2.85 : p.size === "medium" ? 3.35 : 3.9;
  setMessage("Now place TWO fingers left and right. Move them inward.", 3.5);
}

function findPimpleAt(wx, wy) {
  let best = null;
  let bestD = Infinity;
  for (const p of game.pimples) {
    if (p.popped) continue;
    const d = dist(wx, wy, p.x, p.y);
    const hit = p.r * 1.8;
    if (d < hit && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function getTwoTouchPointers() {
  return [...pointers.values()].filter(p => p.type === "touch").slice(0, 2);
}

function getAnyTwoPointers() {
  const touches = getTwoTouchPointers();
  if (touches.length >= 2) return touches;
  return [...pointers.values()].slice(0, 2);
}

function isTwoFingerSqueezeReady(p, a, b) {
  const midx = (a.wx + b.wx) / 2;
  const midy = (a.wy + b.wy) / 2;
  const centerError = dist(midx, midy, p.x, p.y);
  const d1 = dist(a.wx, a.wy, p.x, p.y);
  const d2 = dist(b.wx, b.wy, p.x, p.y);
  const separation = dist(a.wx, a.wy, b.wx, b.wy);

  const minSide = p.r * 0.9;
  const maxSide = p.r * 3.8;
  const goodSide = d1 > minSide && d2 > minSide && d1 < maxSide && d2 < maxSide;
  const goodCenter = centerError < p.r * 1.35;
  const goodSep = separation > p.r * 2.1 && separation < p.r * 6.1;

  return {
    ready: goodSide && goodCenter && goodSep,
    centerError,
    d1,
    d2,
    separation,
    positionQuality: clamp(1 - centerError / (p.r * 1.35), 0, 1) * clamp(1 - Math.abs(d1 - d2) / (p.r * 2.4), 0, 1)
  };
}

function beginSqueeze(p, a, b, info) {
  p.squeeze = {
    startA: { x: a.wx, y: a.wy },
    startB: { x: b.wx, y: b.wy },
    lastA: { x: a.wx, y: a.wy },
    lastB: { x: b.wx, y: b.wy },
    startSep: info.separation,
    sep: info.separation,
    inwardTravel: 0,
    outwardTravel: 0,
    pressure: 0,
    totalPressure: 0,
    age: 0,
    lastSquirt: 0,
    startPus: p.pus,
    flow: 0,
    goodFrames: 0,
    badFrames: 0,
    popped: false,
    damaged: false
  };
  state = "squeezing";
  startSkinCompressionRing(p);
  setMessage("Good. Now MOVE BOTH FINGERS INWARD. Strong flow first, then less.", 2.2);
}

function updateSqueeze(p, a, b, dt) {
  const sq = p.squeeze;
  if (!sq) return;

  const sep = dist(a.wx, a.wy, b.wx, b.wy);
  const lastSep = sq.sep;
  const inwardDelta = Math.max(0, lastSep - sep);
  const outwardDelta = Math.max(0, sep - lastSep);
  sq.sep = sep;

  const info = isTwoFingerSqueezeReady(p, a, b);
  if (info.ready) sq.goodFrames += 1;
  else sq.badFrames += 1;

  const normalizedInward = inwardDelta / Math.max(1, p.r);
  const movementPressure = normalizedInward * 3.8;
  const holdPressure = Math.max(0, (sq.startSep - sep) / Math.max(1, p.r * 2.2));
  const positionBonus = info.positionQuality;

  sq.inwardTravel += inwardDelta;
  sq.outwardTravel += outwardDelta;
  sq.age += dt;

  const targetPressure = clamp(holdPressure * 0.75 + movementPressure * 0.7, 0, 1.4) * (0.35 + positionBonus * 0.65);
  sq.pressure = lerp(sq.pressure, targetPressure, 0.20);
  sq.totalPressure += sq.pressure * dt;

  /*
    Realistic flow curve:
    - the pimple has internal pus reservoir p.pus
    - flow becomes strong when pressure is high and the pore opens
    - the first 40% of pus comes out fast
    - later flow slows down because the reservoir is almost empty
    - too much squeezing after empty damages skin
  */
  const poreOpen = smoothstep(0.18, 0.48, sq.pressure);
  const earlyReservoirBoost = 0.35 + p.pus * 1.25;
  const fatigue = clamp(1 - sq.age / 3800, 0.35, 1);
  const flow = poreOpen * sq.pressure * earlyReservoirBoost * fatigue;
  sq.flow = lerp(sq.flow, flow, 0.28);

  if (flow > 0.08 && p.pus > 0) {
    const loss = flow * dt * 0.00055 * (1 + (p.pus > 0.65 ? 1.35 : 0));
    p.pus = clamp(p.pus - loss, 0, 1);
    p.pressure = clamp(sq.pressure, 0, 1);

    const now = performance.now();
    const interval = p.pus > 0.65 ? 28 : p.pus > 0.35 ? 48 : 78;
    if (now - sq.lastSquirt > interval) {
      sq.lastSquirt = now;
      emitPusFromPimple(p, flow, p.pus, info.positionQuality);
    }
  }

  if (sq.pressure > 0.95 && p.pus > 0.05 && Math.random() < 0.10) {
    emitHeavyBlob(p, sq.pressure, p.pus);
  }

  const doneEnough = p.pus <= 0.045 && sq.age > 450;
  const overPressured = p.pus <= 0.025 && sq.pressure > 0.62 && sq.age > 1150;
  const badPositionTooLong = sq.badFrames > 45 && sq.pressure > 0.5;

  if (doneEnough && !sq.popped) {
    sq.popped = true;
    finishPimple(p, info.positionQuality, false);
  }

  if ((overPressured || badPositionTooLong) && !sq.damaged && !p.popped) {
    sq.damaged = true;
    damagePimple(p);
  }
}

function finishPimple(p, positionQuality, hurt) {
  if (p.popped) return;
  p.popped = true;
  p.damaged = hurt;
  p.pressure = 0;
  game.popped += 1;
  combo = hurt ? 1 : clamp(combo + 1, 1, 9);

  const timingScore = hurt ? 0.45 : 1;
  const pusScore = clamp(1 - p.pus, 0, 1);
  const points = Math.floor(1000 * timingScore * (0.45 + positionQuality * 0.35 + pusScore * 0.20) * combo);
  score += points;

  burstFinal(p, hurt ? 0.35 : 1);
  game.faceMood = hurt ? -1 : 1;

  if (hurt) {
    setMessage("Too much / bad angle — red wound. Combo lost.", 2.5);
  } else {
    setMessage("Perfect release! Strong start, then clean finish. +" + points, 2.4);
  }

  selected = null;
  selectedId = null;
  state = "success";
  updateUi();

  setTimeout(() => {
    if (game.popped >= 9) {
      setMessage("All 9 done. Final score: " + Math.floor(score), 8);
      view.targetX = world.w / 2;
      view.targetY = world.h / 2;
      view.targetScale = 0.55;
    } else {
      state = "overview";
      view.targetX = world.w / 2;
      view.targetY = world.h / 2;
      view.targetScale = 0.55;
      setMessage("Tap the next pimple.", 2);
    }
  }, 900);
}

function damagePimple(p) {
  if (p.popped) return;
  p.inflammation = 1;
  game.faceMood = -1;
  cameraShake = 18;
  finishPimple(p, 0.3, true);
}

function startSkinCompressionRing(p) {
  game.rings.push({
    x: p.x,
    y: p.y,
    r: p.r * 1.2,
    max: p.r * 3.0,
    alpha: 0.6,
    color: "rgba(255, 210, 190, 0.95)"
  });
}

function emitPusFromPimple(p, flow, pusLeft, positionQuality) {
  const amount = Math.ceil(1 + flow * 8 + pusLeft * 5);
  const baseForce = 1.5 + flow * 6.5 + pusLeft * 2.2;
  const strongBeginning = pusLeft > 0.65 ? 1.75 : pusLeft > 0.35 ? 1.0 : 0.55;

  for (let i = 0; i < amount; i++) {
    const angle = -Math.PI / 2 + rand(-0.72, 0.72);
    const speed = baseForce * strongBeginning * rand(0.45, 1.15);
    const r = rand(2.0, 5.8) * (pusLeft > 0.65 ? 1.25 : 0.8);
    game.particles.push({
      type: "pus",
      x: p.x + rand(-p.r * 0.16, p.r * 0.16),
      y: p.y - p.r * 0.10 + rand(-p.r * 0.08, p.r * 0.08),
      vx: Math.cos(angle) * speed + rand(-0.45, 0.45),
      vy: Math.sin(angle) * speed - rand(0.2, 1.1),
      g: rand(0.08, 0.17),
      r,
      stretch: rand(1.15, 2.45),
      rot: angle,
      age: 0,
      life: rand(40, 85),
      alpha: 1,
      colorA: pusLeft > 0.55 ? "#fff7b0" : "#ffe06a",
      colorB: pusLeft > 0.55 ? "#dca12d" : "#bd761c"
    });
  }

  game.streams.push({
    x: p.x,
    y: p.y - p.r * 0.08,
    angle: -Math.PI / 2 + rand(-0.36, 0.36),
    length: p.r * (0.8 + flow * 1.6) * strongBeginning,
    width: p.r * (0.11 + flow * 0.12),
    age: 0,
    life: pusLeft > 0.55 ? 22 : 34,
    alpha: 0.9,
    wiggle: rand(-1, 1)
  });

  if (Math.random() < 0.22 + flow * 0.25) {
    wetSound(flow, pusLeft);
  }
}

function emitHeavyBlob(p, pressure, pusLeft) {
  const angle = -Math.PI / 2 + rand(-0.45, 0.45);
  const speed = rand(2.5, 5.0) * (0.5 + pressure);
  game.particles.push({
    type: "blob",
    x: p.x + rand(-p.r * 0.1, p.r * 0.1),
    y: p.y - p.r * 0.1,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    g: rand(0.11, 0.2),
    r: rand(5, 10) * (pusLeft > 0.5 ? 1.1 : 0.75),
    stretch: rand(1.0, 1.55),
    rot: angle,
    age: 0,
    life: rand(55, 95),
    alpha: 1,
    colorA: "#fff9bf",
    colorB: "#c98220"
  });
}

function burstFinal(p, quality) {
  cameraShake = 10 + quality * 16;

  const amount = Math.floor(22 + p.r * 0.7 * quality);
  for (let i = 0; i < amount; i++) {
    const angle = -Math.PI / 2 + rand(-1.15, 1.15);
    const speed = rand(2.5, 9.5) * quality;
    game.particles.push({
      type: "burst",
      x: p.x + rand(-p.r * 0.15, p.r * 0.15),
      y: p.y - p.r * 0.12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0.5, 1.5),
      g: rand(0.13, 0.22),
      r: rand(2.5, 7.0),
      stretch: rand(1.3, 3.1),
      rot: angle,
      age: 0,
      life: rand(45, 95),
      alpha: 1,
      colorA: "#fffbd4",
      colorB: "#c37b1d"
    });
  }

  for (let i = 0; i < 12; i++) {
    const a = rand(0, Math.PI * 2);
    const d = rand(0.2, 1.0) * p.r;
    game.splats.push({
      x: p.x + Math.cos(a) * d,
      y: p.y + Math.sin(a) * d,
      r: rand(2, 7),
      alpha: rand(0.35, 0.8),
      age: 0,
      life: rand(160, 300),
      rot: rand(0, Math.PI),
      squash: rand(0.35, 0.75)
    });
  }

  wetPopSound(quality);
  if (navigator.vibrate) navigator.vibrate(quality > 0.7 ? [15, 30, 75] : [40, 30, 40]);
}

function wetSound(flow, pusLeft) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = window.__ac || new AC();
    window.__ac = ac;
    const now = ac.currentTime;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035 + flow * 0.06, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    gain.connect(ac.destination);

    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.11), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * 0.7;
    }
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520 + pusLeft * 560;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(gain);
    src.start(now);
    src.stop(now + 0.12);
  } catch (e) {}
}

function wetPopSound(quality) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = window.__ac || new AC();
    window.__ac = ac;
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.26 * quality, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    master.connect(ac.destination);

    const osc = ac.createOscillator();
    const og = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    og.gain.setValueAtTime(0.45, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(og);
    og.connect(master);
    osc.start(now);
    osc.stop(now + 0.22);

    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.24), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = ((Math.random() * 2 - 1) * 0.8 + Math.sin(i * 0.08) * 0.25) * Math.pow(1 - t, 3.2);
    }
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    filter.Q.value = 1.7;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(master);
    src.start(now);
    src.stop(now + 0.25);
  } catch (e) {}
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.age += dt * 0.06;
    p.vy += p.g * dt * 0.06;
    p.x += p.vx * dt * 0.06;
    p.y += p.vy * dt * 0.06;
    p.rot = Math.atan2(p.vy, p.vx);
    p.alpha = Math.max(0, 1 - p.age / p.life);

    if (p.y > world.h * 0.72 && Math.random() < 0.02) {
      p.vy *= -0.15;
      p.vx *= 0.75;
    }

    if (p.alpha > 0.2 && Math.random() < 0.011) {
      game.splats.push({
        x: p.x,
        y: p.y,
        r: p.r * rand(0.45, 0.95),
        alpha: p.alpha * 0.65,
        age: 0,
        life: rand(90, 200),
        rot: p.rot,
        squash: rand(0.32, 0.78)
      });
    }
  }
  game.particles = game.particles.filter(p => p.alpha > 0.02 && p.age < p.life);

  for (const s of game.streams) {
    s.age += dt * 0.06;
    s.alpha = Math.max(0, 1 - s.age / s.life);
  }
  game.streams = game.streams.filter(s => s.alpha > 0.02);

  for (const s of game.splats) {
    s.age += dt * 0.06;
    s.alpha *= 0.997;
  }
  game.splats = game.splats.filter(s => s.age < s.life && s.alpha > 0.03);

  for (const r of game.rings) {
    r.r += (r.max - r.r) * 0.045 * dt * 0.06;
    r.alpha *= 0.985;
  }
  game.rings = game.rings.filter(r => r.alpha > 0.03);
}

function updateInputLogic(dt) {
  if (selected && !selected.popped) {
    const two = getTwoTouchPointers();

    if (two.length >= 2) {
      const a = two[0];
      const b = two[1];
      const info = isTwoFingerSqueezeReady(selected, a, b);

      if (!selected.squeeze && info.ready) {
        beginSqueeze(selected, a, b, info);
      }

      if (selected.squeeze) {
        updateSqueeze(selected, a, b, dt);
      }

      pressureBar.style.width = ((selected.squeeze ? clamp(selected.squeeze.pressure / 1.05, 0, 1) : 0) * 100).toFixed(1) + "%";
      pusBar.style.width = (selected.pus * 100).toFixed(1) + "%";
      positionBar.style.width = (info.positionQuality * 100).toFixed(1) + "%";
    } else {
      const any = getAnyTwoPointers();
      if (any.length < 2 && state === "focused") {
        pressureBar.style.width = "0%";
        pusBar.style.width = (selected.pus * 100).toFixed(1) + "%";
        positionBar.style.width = "0%";
      }
    }
  } else {
    pressureBar.style.width = "0%";
    pusBar.style.width = "0%";
    positionBar.style.width = "0%";
  }
}

function updateCamera(dt) {
  view.x = lerp(view.x, view.targetX, 0.10);
  view.y = lerp(view.y, view.targetY, 0.10);
  view.scale = lerp(view.scale, view.targetScale, 0.10);

  if (cameraShake > 0.1) {
    cameraShake *= 0.88;
  } else {
    cameraShake = 0;
  }
}

function update(dt) {
  time += dt;
  if (messageTimer > 0) {
    messageTimer -= dt / 1000;
    if (messageTimer <= 0 && selected && state === "focused") {
      setMessage("Two fingers: start wide, then move inward.", 2);
    }
  }

  for (const p of game.pimples) {
    p.inflammation = lerp(p.inflammation, p.damaged ? 1 : 0.25, 0.015);
    if (!p.squeeze) p.pressure = lerp(p.pressure, 0, 0.08);
  }

  game.faceMood = lerp(game.faceMood, 0, 0.01);

  updateInputLogic(dt);
  updateParticles(dt);
  updateCamera(dt);
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const shakeX = cameraShake ? rand(-cameraShake, cameraShake) : 0;
  const shakeY = cameraShake ? rand(-cameraShake, cameraShake) : 0;

  ctx.translate(rect.width / 2 + shakeX, rect.height / 2 + shakeY);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.x, -view.y);

  drawBackground();
  drawFace();
  drawAllPimples();
  drawPusEffects();
  drawFingerGuides();

  ctx.restore();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, world.h);
  g.addColorStop(0, "#202a38");
  g.addColorStop(1, "#121923");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, world.w, world.h);
}

function drawFace() {
  ctx.save();
  ctx.translate(world.w / 2, 860);

  const faceGrad = ctx.createRadialGradient(-170, -350, 100, 0, 0, 650);
  faceGrad.addColorStop(0, "#ffd0b1");
  faceGrad.addColorStop(0.52, "#d99a79");
  faceGrad.addColorStop(1, "#a86455");

  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 405, 585, 0, 0, Math.PI * 2);
  ctx.fill();

  // neck
  ctx.fillStyle = "#b87962";
  ctx.beginPath();
  ctx.roundRect(-145, 500, 290, 260, 80);
  ctx.fill();

  // hair
  ctx.fillStyle = "#2b1815";
  ctx.beginPath();
  ctx.ellipse(0, -540, 420, 170, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-370, -535, 740, 130);

  // ears
  ctx.fillStyle = "#c6866c";
  ctx.beginPath();
  ctx.ellipse(-415, -40, 70, 145, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(415, -40, 70, 145, 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(80,30,20,0.25)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(-415, -40, 36, -1.3, 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(415, -40, 36, 1.8, 4.5);
  ctx.stroke();

  // eyes
  drawEye(-145, -160, game.faceMood);
  drawEye(145, -160, game.faceMood);

  // eyebrows
  ctx.strokeStyle = "#2a1713";
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-220, -250 + game.faceMood * -8);
  ctx.quadraticCurveTo(-145, -275 + game.faceMood * -20, -70, -245);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(70, -245);
  ctx.quadraticCurveTo(145, -275 + game.faceMood * -20, 220, -250 + game.faceMood * -8);
  ctx.stroke();

  // nose
  ctx.strokeStyle = "rgba(98,45,33,0.35)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, -105);
  ctx.quadraticCurveTo(30, 30, -15, 90);
  ctx.stroke();
  ctx.fillStyle = "rgba(92,40,31,0.38)";
  ctx.beginPath();
  ctx.ellipse(-38, 100, 20, 10, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(38, 100, 20, 10, 0.25, 0, Math.PI * 2);
  ctx.fill();

  // mouth
  ctx.strokeStyle = "#642e2e";
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (game.faceMood < -0.15) {
    ctx.moveTo(-95, 245);
    ctx.quadraticCurveTo(0, 205, 95, 245);
  } else {
    ctx.moveTo(-105, 220);
    ctx.quadraticCurveTo(0, 275 + game.faceMood * 25, 105, 220);
  }
  ctx.stroke();

  // skin texture
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 140; i++) {
    const x = rand(-330, 330);
    const y = rand(-450, 410);
    if ((x * x) / (390 * 390) + (y * y) / (565 * 565) < 1) {
      ctx.fillStyle = i % 2 ? "#8d4e42" : "#ffd8be";
      ctx.beginPath();
      ctx.arc(x, y, rand(1.2, 2.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawEye(x, y, mood) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 58, mood < -0.1 ? 18 : 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#262d35";
  ctx.beginPath();
  ctx.arc(0, 3, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAllPimples() {
  for (const p of game.pimples) {
    drawPimple(p);
  }
}

function drawPimple(p) {
  ctx.save();

  const selectedPulse = selectedId === p.id ? 1 + Math.sin(time * 0.006) * 0.04 : 1;
  const pressureSquash = 1 - p.pressure * 0.10;
  const r = p.r * selectedPulse;

  // red swollen skin around pimple
  const red = p.damaged ? 0.95 : p.inflammation;
  const inflame = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r * 2.2);
  inflame.addColorStop(0, `rgba(205, 50, 44, ${0.26 + red * 0.25})`);
  inflame.addColorStop(0.45, `rgba(220, 78, 54, ${0.16 + red * 0.15})`);
  inflame.addColorStop(1, "rgba(220, 78, 54, 0)");
  ctx.fillStyle = inflame;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // irregular raised bump
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1 + p.pressure * 0.08, pressureSquash);
  const bump = ctx.createRadialGradient(-r * 0.34, -r * 0.42, r * 0.1, 0, 0, r * 1.25);
  bump.addColorStop(0, "#ffe0c8");
  bump.addColorStop(0.45, "#dc8f79");
  bump.addColorStop(0.78, "#b84c50");
  bump.addColorStop(1, "#8e3338");
  ctx.fillStyle = bump;
  ctx.beginPath();
  for (let i = 0; i < p.irregular.length; i++) {
    const pt = p.irregular[i];
    const rr = r * pt.m * (p.popped ? 0.78 : 1);
    const x = Math.cos(pt.a) * rr;
    const y = Math.sin(pt.a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // white/yellow head showing remaining pus
  if (!p.popped || p.pus > 0.02) {
    const headR = r * (0.30 + p.pus * 0.22);
    const head = ctx.createRadialGradient(-headR * 0.28, -headR * 0.28, 0, 0, 0, headR);
    head.addColorStop(0, "#fffdf0");
    head.addColorStop(0.45, "#ffe56a");
    head.addColorStop(1, "#d08c21");
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.08, headR * (1 + p.pressure * 0.45), headR * (1 - p.pressure * 0.18), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // popped pore hole
  if (p.popped) {
    ctx.fillStyle = p.damaged ? "#7d1216" : "#5c2521";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.05, r * 0.28, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // shine
  ctx.globalAlpha = p.popped ? 0.18 : 0.55;
  ctx.fillStyle = "#fff7ec";
  ctx.beginPath();
  ctx.ellipse(-r * 0.24, -r * 0.34, r * 0.22, r * 0.09, -0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // pores
  ctx.fillStyle = "rgba(80, 30, 25, 0.30)";
  for (const pore of p.pores) {
    const px = Math.cos(pore.a) * pore.d * r;
    const py = Math.sin(pore.a) * pore.d * r;
    ctx.beginPath();
    ctx.arc(px, py, pore.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (selectedId === p.id && !p.popped) {
    ctx.strokeStyle = "rgba(255, 245, 160, 0.9)";
    ctx.lineWidth = 4 / view.scale;
    ctx.setLineDash([12 / view.scale, 10 / view.scale]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawPusEffects() {
  for (const r of game.rings) {
    ctx.save();
    ctx.globalAlpha = r.alpha;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const s of game.streams) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const ex = s.x + Math.cos(s.angle) * s.length;
    const ey = s.y + Math.sin(s.angle) * s.length;
    const grad = ctx.createLinearGradient(s.x, s.y, ex, ey);
    grad.addColorStop(0, "rgba(255,255,235,0.98)");
    grad.addColorStop(0.35, "rgba(255,227,73,0.96)");
    grad.addColorStop(1, "rgba(176,104,18,0.65)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.bezierCurveTo(
      s.x + Math.cos(s.angle - 0.45) * s.length * 0.35,
      s.y + Math.sin(s.angle - 0.45) * s.length * 0.35,
      s.x + Math.cos(s.angle + 0.33) * s.length * 0.7,
      s.y + Math.sin(s.angle + 0.33) * s.length * 0.7,
      ex,
      ey
    );
    ctx.stroke();
    ctx.restore();
  }

  for (const d of game.particles) {
    ctx.save();
    ctx.globalAlpha = d.alpha;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    const g = ctx.createRadialGradient(-d.r * 0.3, -d.r * 0.25, 0, 0, 0, d.r * 1.8);
    g.addColorStop(0, "#fffef2");
    g.addColorStop(0.28, d.colorA);
    g.addColorStop(0.78, d.colorB);
    g.addColorStop(1, "rgba(120,70,15,0.15)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.r * d.stretch, d.r, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.beginPath();
    ctx.ellipse(-d.r * 0.35, -d.r * 0.35, d.r * 0.35, d.r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const s of game.splats) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s.r * 1.6);
    grad.addColorStop(0, "rgba(255,238,102,0.8)");
    grad.addColorStop(0.65, "rgba(198,121,26,0.42)");
    grad.addColorStop(1, "rgba(120,70,18,0.03)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, s.r * 1.7, s.r * s.squash, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFingerGuides() {
  if (!selected || selected.popped) return;

  const two = getTwoTouchPointers();
  ctx.save();

  if (two.length < 2) {
    // Show where fingers should be placed.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 5 / view.scale;
    ctx.setLineDash([10 / view.scale, 8 / view.scale]);
    ctx.beginPath();
    ctx.arc(selected.x - selected.r * 2.1, selected.y, selected.r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(selected.x + selected.r * 2.1, selected.y, selected.r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `${Math.max(12, 20 / view.scale)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("finger", selected.x - selected.r * 2.1, selected.y - selected.r * 0.9);
    ctx.fillText("finger", selected.x + selected.r * 2.1, selected.y - selected.r * 0.9);
  } else {
    const a = two[0];
    const b = two[1];
    const info = isTwoFingerSqueezeReady(selected, a, b);

    ctx.strokeStyle = info.ready ? "rgba(120,255,160,0.95)" : "rgba(255,90,70,0.9)";
    ctx.lineWidth = 4 / view.scale;
    ctx.beginPath();
    ctx.moveTo(a.wx, a.wy);
    ctx.lineTo(selected.x, selected.y);
    ctx.lineTo(b.wx, b.wy);
    ctx.stroke();

    // inward arrows
    drawArrow(a.wx, a.wy, selected.x, selected.y, info.ready);
    drawArrow(b.wx, b.wy, selected.x, selected.y, info.ready);

    ctx.fillStyle = info.ready ? "rgba(120,255,160,0.95)" : "rgba(255,90,70,0.95)";
    ctx.beginPath();
    ctx.arc(a.wx, a.wy, 10 / view.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.wx, b.wy, 10 / view.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, good) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.min(55, dist(x1, y1, x2, y2) * 0.35);
  const sx = x1 + Math.cos(a) * 18;
  const sy = y1 + Math.sin(a) * 18;
  const ex = sx + Math.cos(a) * len;
  const ey = sy + Math.sin(a) * len;
  ctx.save();
  ctx.strokeStyle = good ? "rgba(120,255,160,0.95)" : "rgba(255,90,70,0.9)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 5 / view.scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(a - 0.55) * 16 / view.scale, ey - Math.sin(a - 0.55) * 16 / view.scale);
  ctx.lineTo(ex - Math.cos(a + 0.55) * 16 / view.scale, ey - Math.sin(a + 0.55) * 16 / view.scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function handlePointerDown(e) {
  canvas.setPointerCapture(e.pointerId);
  const w = screenToWorld(e.clientX, e.clientY);
  pointers.set(e.pointerId, {
    id: e.pointerId,
    type: e.pointerType,
    sx: e.clientX,
    sy: e.clientY,
    wx: w.x,
    wy: w.y,
    startSx: e.clientX,
    startSy: e.clientY,
    startWx: w.x,
    startWy: w.y
  });

  if (e.pointerType === "mouse") {
    mouseDown = true;
  }

  const touchPointers = getTwoTouchPointers();
  if (touchPointers.length === 2) {
    pinchStart = {
      d: dist(touchPointers[0].sx, touchPointers[0].sy, touchPointers[1].sx, touchPointers[1].sy),
      scale: view.targetScale,
      x: view.targetX,
      y: view.targetY,
      mid: {
        x: (touchPointers[0].sx + touchPointers[1].sx) / 2,
        y: (touchPointers[0].sy + touchPointers[1].sy) / 2
      }
    };
  }

  if (pointers.size === 1 && state !== "squeezing") {
    const p = findPimpleAt(w.x, w.y);
    if (p) {
      focusPimple(p);
    }
  }
}

function handlePointerMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;

  const w = screenToWorld(e.clientX, e.clientY);
  p.sx = e.clientX;
  p.sy = e.clientY;
  p.wx = w.x;
  p.wy = w.y;

  const touchPointers = getTwoTouchPointers();

  // Pinch camera only when not actively squeezing selected pimple.
  if (touchPointers.length === 2 && (!selected || !selected.squeeze)) {
    const a = touchPointers[0];
    const b = touchPointers[1];

    if (!pinchStart) {
      pinchStart = {
        d: dist(a.sx, a.sy, b.sx, b.sy),
        scale: view.targetScale,
        x: view.targetX,
        y: view.targetY,
        mid: {
          x: (a.sx + b.sx) / 2,
          y: (a.sy + b.sy) / 2
        }
      };
    }

    const d = dist(a.sx, a.sy, b.sx, b.sy);
    const ratio = d / Math.max(1, pinchStart.d);
    view.targetScale = clamp(pinchStart.scale * ratio, 0.45, 5.25);

    const mid = {
      x: (a.sx + b.sx) / 2,
      y: (a.sy + b.sy) / 2
    };
    const rect = canvas.getBoundingClientRect();
    const dx = (mid.x - pinchStart.mid.x) / view.targetScale;
    const dy = (mid.y - pinchStart.mid.y) / view.targetScale;
    view.targetX = clamp(pinchStart.x - dx, 200, world.w - 200);
    view.targetY = clamp(pinchStart.y - dy, 250, world.h - 220);
  }

  // Desktop pan when no selected pimple.
  if (e.pointerType === "mouse" && mouseDown && !selected) {
    const dx = (e.movementX || 0) / view.scale;
    const dy = (e.movementY || 0) / view.scale;
    view.targetX -= dx;
    view.targetY -= dy;
  }
}

function handlePointerUp(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (e.pointerType === "mouse") mouseDown = false;

  if (selected && selected.squeeze && !selected.popped) {
    // Releasing too early leaves pus inside.
    if (selected.pus > 0.10) {
      selected.squeeze = null;
      selected.pressure = 0;
      state = "focused";
      combo = 1;
      setMessage("Too early — still pus inside. Put two fingers again and squeeze inward.", 3);
      updateUi();
    }
  }

  if (getTwoTouchPointers().length < 2) {
    pinchStart = null;
  }
}

function handleWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 0.88;
  view.targetScale = clamp(view.targetScale * factor, 0.45, 5.25);

  const w = screenToWorld(e.clientX, e.clientY);
  view.targetX = lerp(view.targetX, w.x, 0.12);
  view.targetY = lerp(view.targetY, w.y, 0.12);
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
canvas.addEventListener("wheel", handleWheel, { passive: false });

function loop(now) {
  const dt = Math.min(40, now - lastFrame);
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

createPimples();
setMessage("Tap a pimple. Then use two fingers and move inward.", 5);
updateUi();
requestAnimationFrame(loop);
