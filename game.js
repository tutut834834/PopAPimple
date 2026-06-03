
/*
=====================================================================
REALISTIC PUS / POP FEEDBACK SYSTEM
=====================================================================
This block makes the pimple popping feel much more physical:
- pressure builds while two fingers squeeze
- pus starts as a slow thick bead
- then a sudden pop burst happens
- droplets fly outward with gravity, stretch, shine, and fade
- yellow/white liquid continues to ooze shortly after the pop
- screen shake, vibration, and squish sound give the player feedback
=====================================================================
*/

const PusFX = {
  streams: [],
  droplets: [],
  splats: [],
  pressureRings: [],
  activeOoze: null,
  shake: 0,
  lastPopAt: 0,

  reset() {
    this.streams.length = 0;
    this.droplets.length = 0;
    this.splats.length = 0;
    this.pressureRings.length = 0;
    this.activeOoze = null;
    this.shake = 0;
  },

  startOoze(pimple) {
    this.activeOoze = {
      pimple,
      age: 0,
      phase: "bead",
      bead: 0,
      ropeLength: 0,
      thickness: 0,
      pulse: 0,
      direction: -Math.PI / 2 + (Math.random() - 0.5) * 0.55,
      sideDirection: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random() * 9999
    };
  },

  pressurePulse(x, y, size, strength) {
    this.pressureRings.push({
      x, y,
      r: size * 0.5,
      maxR: size * (1.8 + strength * 0.6),
      alpha: 0.45,
      line: 2 + strength * 4
    });
  },

  burst(pimple, quality = 1) {
    const size = pimple.radius || pimple.r || pimple.size || 22;
    const x = pimple.x;
    const y = pimple.y - size * 0.15;
    const amount = Math.floor(28 + size * 1.25 + quality * 22);
    const force = 4.8 + quality * 4.8 + size * 0.09;

    this.lastPopAt = performance.now();
    this.shake = 9 + quality * 11;

    for (let i = 0; i < amount; i++) {
      const mainAngle = -Math.PI / 2 + (Math.random() - 0.5) * 1.55;
      const spd = force * (0.35 + Math.random() * 0.95);
      const thick = 1.8 + Math.random() * (size * 0.12 + 3.2);
      this.droplets.push({
        x: x + (Math.random() - 0.5) * size * 0.35,
        y: y + (Math.random() - 0.5) * size * 0.25,
        vx: Math.cos(mainAngle) * spd + (Math.random() - 0.5) * 1.2,
        vy: Math.sin(mainAngle) * spd - Math.random() * 1.2,
        g: 0.17 + Math.random() * 0.11,
        r: thick,
        stretch: 1.4 + Math.random() * 2.8,
        rot: mainAngle,
        age: 0,
        life: 42 + Math.random() * 34,
        colorShift: Math.random(),
        alpha: 1
      });
    }

    for (let i = 0; i < 7 + quality * 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = size * (0.25 + Math.random() * 0.7);
      this.splats.push({
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        r: 2 + Math.random() * 5 + size * 0.04,
        alpha: 0.78,
        age: 0,
        life: 120 + Math.random() * 120,
        squash: 0.55 + Math.random() * 0.65,
        rot: Math.random() * Math.PI
      });
    }

    this.streams.push({
      x,
      y,
      age: 0,
      life: 58,
      size,
      quality,
      angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.45,
      length: size * (0.9 + quality * 1.4),
      width: size * (0.22 + quality * 0.08)
    });

    this.playWetPop(quality);
    this.vibrate(quality);
  },

  playWetPop(quality = 1) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ac = window.__pimpleAudioContext || new AudioContextClass();
      window.__pimpleAudioContext = ac;

      const now = ac.currentTime;
      const master = ac.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.34, now + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      master.connect(ac.destination);

      const osc = ac.createOscillator();
      const oscGain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(95 + quality * 50, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);
      oscGain.gain.setValueAtTime(0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(oscGain);
      oscGain.connect(master);
      osc.start(now);
      osc.stop(now + 0.24);

      const bufferSize = ac.sampleRate * 0.22;
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        const wet = Math.sin(i * 0.065) * 0.28 + (Math.random() * 2 - 1) * 0.72;
        data[i] = wet * Math.pow(1 - t, 3.4);
      }
      const noise = ac.createBufferSource();
      noise.buffer = buffer;
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(720 + quality * 360, now);
      filter.Q.setValueAtTime(1.8, now);
      noise.connect(filter);
      filter.connect(master);
      noise.start(now);
      noise.stop(now + 0.22);
    } catch (e) {
      // Audio is optional; game must keep working on locked mobile browsers.
    }
  },

  vibrate(quality = 1) {
    if (navigator.vibrate) {
      navigator.vibrate([18, 25, Math.floor(40 + quality * 45)]);
    }
  },

  update(dt = 1) {
    if (this.shake > 0) this.shake *= 0.86;

    if (this.activeOoze) {
      const o = this.activeOoze;
      o.age += dt;
      o.pulse += dt * 0.14;
      o.bead = Math.min(1, o.bead + dt * 0.03);
      o.ropeLength = Math.min((o.pimple.radius || o.pimple.r || 24) * 1.35, o.ropeLength + dt * 0.38);
      o.thickness = Math.min((o.pimple.radius || o.pimple.r || 24) * 0.24, o.thickness + dt * 0.08);
    }

    for (const d of this.droplets) {
      d.age += dt;
      d.vy += d.g * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot = Math.atan2(d.vy, d.vx);
      d.alpha = Math.max(0, 1 - d.age / d.life);
      if (d.age > d.life * 0.45 && Math.random() < 0.055) {
        this.splats.push({
          x: d.x,
          y: d.y,
          r: d.r * (0.7 + Math.random() * 0.8),
          alpha: d.alpha * 0.65,
          age: 0,
          life: 90 + Math.random() * 100,
          squash: 0.45 + Math.random() * 0.75,
          rot: d.rot
        });
      }
    }
    this.droplets = this.droplets.filter(d => d.age < d.life && d.alpha > 0.02);

    for (const s of this.splats) {
      s.age += dt;
      s.alpha *= 0.992;
    }
    this.splats = this.splats.filter(s => s.age < s.life && s.alpha > 0.03);

    for (const st of this.streams) st.age += dt;
    this.streams = this.streams.filter(st => st.age < st.life);

    for (const r of this.pressureRings) {
      r.r += (r.maxR - r.r) * 0.09 * dt;
      r.alpha *= 0.92;
      r.line *= 0.96;
    }
    this.pressureRings = this.pressureRings.filter(r => r.alpha > 0.025);
  },

  draw(ctx) {
    ctx.save();

    if (this.shake > 0.4) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    for (const r of this.pressureRings) {
      ctx.save();
      ctx.globalAlpha = r.alpha;
      ctx.strokeStyle = "rgba(255, 210, 190, 0.95)";
      ctx.lineWidth = r.line;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.activeOoze) {
      this.drawOoze(ctx, this.activeOoze);
    }

    for (const st of this.streams) {
      this.drawStream(ctx, st);
    }

    for (const d of this.droplets) {
      this.drawDroplet(ctx, d);
    }

    for (const s of this.splats) {
      this.drawSplat(ctx, s);
    }

    ctx.restore();
  },

  drawOoze(ctx, o) {
    const p = o.pimple;
    const size = p.radius || p.r || p.size || 24;
    const x = p.x;
    const y = p.y - size * 0.15;
    const wiggle = Math.sin(o.pulse) * size * 0.035;
    const len = o.ropeLength;
    const thick = Math.max(2, o.thickness);
    const endX = x + Math.cos(o.direction) * len * 0.35 + wiggle * o.sideDirection;
    const endY = y + Math.sin(o.direction) * len + size * 0.18;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const grad = ctx.createLinearGradient(x, y, endX, endY);
    grad.addColorStop(0, "rgba(255,255,232,0.98)");
    grad.addColorStop(0.35, "rgba(255,225,89,0.96)");
    grad.addColorStop(1, "rgba(214,152,32,0.82)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = thick;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + wiggle * 2.2,
      y + len * 0.45,
      endX,
      endY
    );
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 247, 183, 0.98)";
    ctx.beginPath();
    ctx.ellipse(x, y, thick * 1.25, thick * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.ellipse(x - thick * 0.25, y - thick * 0.28, thick * 0.38, thick * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,230,94,0.96)";
    ctx.beginPath();
    ctx.ellipse(endX, endY, thick * 0.82, thick * 0.62, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  drawStream(ctx, st) {
    const t = st.age / st.life;
    const alpha = Math.max(0, 1 - t);
    const x = st.x;
    const y = st.y;
    const len = st.length * (1 - t * 0.25);
    const w = st.width * (1 - t * 0.5);
    const ex = x + Math.cos(st.angle) * len;
    const ey = y + Math.sin(st.angle) * len;

    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, w);
    const grad = ctx.createLinearGradient(x, y, ex, ey);
    grad.addColorStop(0, "rgba(255,255,238,0.98)");
    grad.addColorStop(0.38, "rgba(255,221,76,0.98)");
    grad.addColorStop(1, "rgba(199,131,20,0.55)");
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + Math.cos(st.angle - 0.4) * len * 0.25,
      y + Math.sin(st.angle - 0.4) * len * 0.25,
      x + Math.cos(st.angle + 0.25) * len * 0.68,
      y + Math.sin(st.angle + 0.25) * len * 0.68,
      ex,
      ey
    );
    ctx.stroke();
    ctx.restore();
  },

  drawDroplet(ctx, d) {
    ctx.save();
    ctx.globalAlpha = d.alpha;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    const grad = ctx.createRadialGradient(-d.r * 0.3, -d.r * 0.25, 0, 0, 0, d.r * 1.55);
    grad.addColorStop(0, "rgba(255,255,245,0.98)");
    grad.addColorStop(0.28, "rgba(255,236,118,0.98)");
    grad.addColorStop(0.72, "rgba(238,181,47,0.96)");
    grad.addColorStop(1, "rgba(174,104,18,0.72)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.r * d.stretch, d.r, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.ellipse(-d.r * 0.35, -d.r * 0.35, d.r * 0.35, d.r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  drawSplat(ctx, s) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s.r * 1.7);
    grad.addColorStop(0, "rgba(255,241,136,0.82)");
    grad.addColorStop(0.65, "rgba(225,165,38,0.54)");
    grad.addColorStop(1, "rgba(174,89,20,0.05)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, s.r * 1.55, s.r * s.squash, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

function triggerRealisticPusStart(pimple) {
  if (!pimple) return;
  PusFX.startOoze(pimple);
}

function triggerRealisticPusPressure(pimple, strength) {
  if (!pimple) return;
  const size = pimple.radius || pimple.r || pimple.size || 22;
  if (Math.random() < 0.18 + strength * 0.14) {
    PusFX.pressurePulse(pimple.x, pimple.y, size, strength);
  }
}

function triggerRealisticPusBurst(pimple, quality) {
  if (!pimple) return;
  PusFX.burst(pimple, quality);
}

(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const ui = {
    scoreText: document.getElementById('scoreText'),
    comboText: document.getElementById('comboText'),
    doneText: document.getElementById('doneText'),
    feedbackToast: document.getElementById('feedbackToast'),
    damageFlash: document.getElementById('damageFlash'),
    progressFill: document.getElementById('progressFill'),
    progressLabel: document.getElementById('progressLabel'),
    positionFill: document.getElementById('positionFill'),
    positionLabel: document.getElementById('positionLabel'),
    pressureFill: document.getElementById('pressureFill'),
    pressureLabel: document.getElementById('pressureLabel'),
    modeTitle: document.getElementById('modeTitle'),
    modeBody: document.getElementById('modeBody'),
    focusButton: document.getElementById('focusButton'),
    zoomInButton: document.getElementById('zoomInButton'),
    zoomOutButton: document.getElementById('zoomOutButton'),
    resetViewButton: document.getElementById('resetViewButton'),
    restartButton: document.getElementById('restartButton')
  };

  const WORLD = {
    width: 1000,
    height: 1400,
    faceX: 500,
    faceY: 700,
    faceRx: 330,
    faceRy: 465,
    faceTop: 215,
    faceBottom: 1165
  };

  const TARGET_SECONDS = 3.0;
  const EARLY_LIMIT = 2.45;
  const PERFECT_MIN = 2.72;
  const PERFECT_MAX = 3.32;
  const DAMAGE_LIMIT = 3.75;
  const MAX_SCALE = 7.2;
  const MIN_SCALE = 0.55;

  let width = 1;
  let height = 1;
  let dpr = 1;
  let lastTime = performance.now();
  let score = 0;
  let combo = 1;
  let selectedId = null;
  let activeMessageUntil = 0;
  let shakeTime = 0;
  let blinkTime = 0;
  let happyTime = 0;
  let hurtTime = 0;
  let desktopHolding = false;
  let pointerDown = false;
  let mouseStart = null;
  let mouseCurrent = null;
  let isDragging = false;
  let dragLast = null;
  let spaceHeld = false;
  let audioReady = false;
  let audioContext = null;

  const camera = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    scale: 0.95,
    targetX: WORLD.width / 2,
    targetY: WORLD.height / 2,
    targetScale: 0.95,
    animating: false
  };

  const touchState = {
    touches: new Map(),
    lastDistance: 0,
    lastMid: null,
    mode: 'none',
    movedSinceStart: false,
    twoFingerStartTime: 0,
    squeezeCandidate: false
  };

  const particles = [];
  const floatingTexts = [];
  const ripples = [];
  const decorativePores = [];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function rand(seed) {
    const x = Math.sin(seed * 9283.123) * 43758.5453123;
    return x - Math.floor(x);
  }

  function randomRange(seed, min, max) {
    return min + rand(seed) * (max - min);
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function screenToWorld(point) {
    return {
      x: camera.x + (point.x - width / 2) / camera.scale,
      y: camera.y + (point.y - height / 2) / camera.scale
    };
  }

  function worldToScreen(point) {
    return {
      x: width / 2 + (point.x - camera.x) * camera.scale,
      y: height / 2 + (point.y - camera.y) * camera.scale
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!camera.animating && selectedId === null) {
      fitFullFace(false);
    }
  }

  function fitFullFace(animated = true) {
    const sx = width / (WORLD.faceRx * 2.55);
    const sy = height / (WORLD.faceRy * 2.45);
    const scale = clamp(Math.min(sx, sy), MIN_SCALE, 1.6);
    setCameraTarget(WORLD.faceX, WORLD.faceY, scale, animated);
    selectedId = null;
    updateMode('Find a pimple', 'Tap one of the 9 pimples. Pinch zoom and pan are active.');
  }

  function setCameraTarget(x, y, scale, animated = true) {
    camera.targetX = clamp(x, 180, WORLD.width - 180);
    camera.targetY = clamp(y, 170, WORLD.height - 170);
    camera.targetScale = clamp(scale, MIN_SCALE, MAX_SCALE);
    camera.animating = animated;
    if (!animated) {
      camera.x = camera.targetX;
      camera.y = camera.targetY;
      camera.scale = camera.targetScale;
      camera.animating = false;
    }
  }

  function bumpCameraToPimple(pimple, extraZoom = 1) {
    selectedId = pimple.id;
    const desiredScale = clamp(3.45 + pimple.zoomBoost + extraZoom, 2.9, MAX_SCALE);
    setCameraTarget(pimple.x, pimple.y - pimple.radius * 0.18, desiredScale, true);
    addRipple(pimple.x, pimple.y, pimple.radius * 2.2, 'focus');
    showFeedback(`Focused ${pimple.label}. Pinch if you want, then squeeze with two fingers.`);
    updateMode('Pimple centered', 'Place two fingers on opposite sides of the detailed pimple. Hold close to 3 seconds.');
  }

  function zoomAtScreenPoint(screenPoint, factor) {
    const before = screenToWorld(screenPoint);
    const newScale = clamp(camera.scale * factor, MIN_SCALE, MAX_SCALE);
    camera.scale = newScale;
    camera.targetScale = newScale;
    camera.x = before.x - (screenPoint.x - width / 2) / camera.scale;
    camera.y = before.y - (screenPoint.y - height / 2) / camera.scale;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    clampCamera();
  }

  function clampCamera() {
    const marginX = width / camera.scale * 0.48;
    const marginY = height / camera.scale * 0.48;
    camera.x = clamp(camera.x, marginX - 120, WORLD.width - marginX + 120);
    camera.y = clamp(camera.y, marginY - 120, WORLD.height - marginY + 120);
    camera.targetX = camera.x;
    camera.targetY = camera.y;
  }

  function createPimples() {
    return [
      makePimple(0, 'small forehead left', 382, 385, 16, 'small', 0.65, 11),
      makePimple(1, 'small cheek right', 618, 675, 15, 'small', 0.70, 21),
      makePimple(2, 'small chin', 470, 1005, 17, 'small', 0.58, 31),
      makePimple(3, 'middle forehead', 528, 343, 24, 'middle', 0.35, 41),
      makePimple(4, 'middle cheek left', 355, 660, 27, 'middle', 0.30, 51),
      makePimple(5, 'middle jaw right', 645, 905, 25, 'middle', 0.38, 61),
      makePimple(6, 'big nose side', 558, 588, 37, 'big', 0.00, 71),
      makePimple(7, 'big cheek lower left', 398, 850, 41, 'big', -0.08, 81),
      makePimple(8, 'big upper lip side', 585, 815, 35, 'big', 0.05, 91)
    ];
  }

  function makePimple(id, label, x, y, radius, sizeName, zoomBoost, seed) {
    const bumps = [];
    const pores = [];
    const veins = [];
    const shine = [];
    for (let i = 0; i < 15; i++) {
      const angle = randomRange(seed + i * 2, 0, Math.PI * 2);
      const len = randomRange(seed + i * 3, radius * 0.15, radius * 0.95);
      bumps.push({
        a: angle,
        r: len,
        size: randomRange(seed + i * 4, radius * 0.06, radius * 0.18),
        lift: randomRange(seed + i * 5, 0.04, 0.18)
      });
    }
    for (let i = 0; i < 18; i++) {
      const angle = randomRange(seed + 100 + i, 0, Math.PI * 2);
      const len = Math.sqrt(rand(seed + 200 + i)) * radius * 0.9;
      pores.push({
        x: Math.cos(angle) * len,
        y: Math.sin(angle) * len * 0.82,
        r: randomRange(seed + 300 + i, radius * 0.035, radius * 0.095),
        dark: randomRange(seed + 400 + i, 0.25, 0.7)
      });
    }
    for (let i = 0; i < 9; i++) {
      veins.push({
        a: randomRange(seed + 500 + i, 0, Math.PI * 2),
        start: randomRange(seed + 600 + i, radius * 0.25, radius * 0.55),
        end: randomRange(seed + 700 + i, radius * 0.75, radius * 1.35),
        curve: randomRange(seed + 800 + i, -0.5, 0.5)
      });
    }
    for (let i = 0; i < 3; i++) {
      shine.push({
        x: randomRange(seed + 900 + i, -radius * 0.38, radius * 0.18),
        y: randomRange(seed + 920 + i, -radius * 0.55, -radius * 0.12),
        rx: randomRange(seed + 940 + i, radius * 0.12, radius * 0.24),
        ry: randomRange(seed + 960 + i, radius * 0.05, radius * 0.12),
        alpha: randomRange(seed + 980 + i, 0.18, 0.36)
      });
    }
    return {
      id,
      label,
      x,
      y,
      radius,
      sizeName,
      seed,
      zoomBoost,
      state: 'ready',
      squeezeTime: 0,
      lastQuality: 0,
      positionQuality: 0,
      pressureQuality: 0,
      damage: 0,
      pus: 1,
      wound: 0,
      pulse: randomRange(seed, 0, Math.PI * 2),
      compression: 0,
      overHeld: false,
      earlyReleased: false,
      bumps,
      pores,
      veins,
      shine
    };
  }

  let pimples = createPimples();

  function createDecorativePores() {
    decorativePores.length = 0;
    for (let i = 0; i < 155; i++) {
      const a = randomRange(i + 5, 0, Math.PI * 2);
      const rr = Math.sqrt(rand(i + 90));
      const x = WORLD.faceX + Math.cos(a) * rr * WORLD.faceRx * 0.88;
      const y = WORLD.faceY + Math.sin(a) * rr * WORLD.faceRy * 0.90;
      if (insideFace(x, y)) {
        decorativePores.push({
          x,
          y,
          r: randomRange(i + 100, 1.2, 3.4),
          alpha: randomRange(i + 200, 0.035, 0.12)
        });
      }
    }
  }

  function insideFace(x, y) {
    const dx = (x - WORLD.faceX) / WORLD.faceRx;
    const dy = (y - WORLD.faceY) / WORLD.faceRy;
    return dx * dx + dy * dy <= 1;
  }

  function selectedPimple() {
    return pimples.find(p => p.id === selectedId) || null;
  }

  function findPimpleAt(worldPoint) {
    let best = null;
    let bestD = Infinity;
    for (const p of pimples) {
      if (p.state === 'popped' || p.state === 'damaged') continue;
      const d = Math.hypot(worldPoint.x - p.x, worldPoint.y - p.y);
      const hit = p.radius * 2.05;
      if (d <= hit && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  function showFeedback(message, duration = 1900) {
    ui.feedbackToast.textContent = message;
    ui.feedbackToast.classList.remove('hidden');
    activeMessageUntil = performance.now() + duration;
  }

  function flashDamage() {
    ui.damageFlash.classList.remove('active');
    void ui.damageFlash.offsetWidth;
    ui.damageFlash.classList.add('active');
  }

  function updateMode(title, body) {
    ui.modeTitle.textContent = title;
    ui.modeBody.textContent = body;
  }

  function updateUI() {
    const done = pimples.filter(p => p.state === 'popped').length;
    ui.scoreText.textContent = Math.round(score).toString();
    ui.comboText.textContent = `x${combo.toFixed(1)}`;
    ui.doneText.textContent = `${done}/9`;
    const p = selectedPimple();
    if (!p || p.state === 'popped' || p.state === 'damaged') {
      ui.progressFill.style.width = '0%';
      ui.progressLabel.textContent = '0%';
      ui.positionFill.style.width = '0%';
      ui.positionLabel.textContent = '--';
      ui.pressureFill.style.width = '0%';
      ui.pressureLabel.textContent = '--';
      return;
    }
    const progress = clamp((p.squeezeTime / TARGET_SECONDS) * 100, 0, 132);
    ui.progressFill.style.width = `${clamp(progress, 0, 100)}%`;
    ui.progressLabel.textContent = `${Math.round(progress)}%`;
    ui.positionFill.style.width = `${Math.round(p.positionQuality * 100)}%`;
    ui.positionLabel.textContent = qualityWord(p.positionQuality);
    ui.pressureFill.style.width = `${Math.round(p.pressureQuality * 100)}%`;
    ui.pressureLabel.textContent = qualityWord(p.pressureQuality);
  }

  function qualityWord(q) {
    if (q > 0.88) return 'perfect';
    if (q > 0.68) return 'good';
    if (q > 0.42) return 'weak';
    if (q > 0.08) return 'bad';
    return '--';
  }

  function initAudio() {
    if (audioReady) return;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioReady = true;
    } catch (e) {
      audioReady = false;
    }
  }

  function tone(freq, duration, type = 'sine', gain = 0.05, delay = 0) {
    if (!audioReady || !audioContext) return;
    const now = audioContext.currentTime + delay;
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.65), now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function popSound() {
    tone(170, 0.09, 'triangle', 0.08, 0);
    tone(82, 0.12, 'sine', 0.09, 0.015);
    tone(460, 0.055, 'square', 0.035, 0.025);
  }

  function hurtSound() {
    tone(90, 0.24, 'sawtooth', 0.05, 0);
    tone(52, 0.28, 'sine', 0.05, 0.08);
  }

  function tinyPusSound() {
    tone(520, 0.035, 'triangle', 0.018, 0);
  }

  function addRipple(x, y, r, type = 'normal') {
    ripples.push({ x, y, r, type, age: 0, life: 0.55 });
  }

  function addFloatingText(x, y, text, mood = 'good') {
    floatingTexts.push({ x, y, text, mood, age: 0, life: 1.1, vy: -42 });
  }

  function addPusParticles(pimple, amount = 10, force = 1) {
    for (let i = 0; i < amount; i++) {
      const a = -Math.PI / 2 + randomRange(performance.now() + i, -0.9, 0.9);
      const speed = randomRange(pimple.seed + i + performance.now(), 40, 150) * force;
      particles.push({
        x: pimple.x + randomRange(pimple.seed + i * 3, -pimple.radius * 0.16, pimple.radius * 0.16),
        y: pimple.y + randomRange(pimple.seed + i * 4, -pimple.radius * 0.08, pimple.radius * 0.18),
        vx: Math.cos(a) * speed * 0.42 + randomRange(pimple.seed + i * 5, -28, 28),
        vy: Math.sin(a) * speed - randomRange(pimple.seed + i * 6, 0, 48),
        r: randomRange(pimple.seed + i * 7, 2.5, 8.5) * (pimple.radius / 32),
        age: 0,
        life: randomRange(pimple.seed + i * 8, 0.55, 1.15),
        color: rand(pimple.seed + i * 9) > 0.28 ? 'pus' : 'clear'
      });
    }
  }

  function scorePimple(p) {
    const timingQuality = 1 - Math.abs(p.squeezeTime - TARGET_SECONDS) / 0.75;
    const tq = clamp(timingQuality, 0, 1);
    const base = p.sizeName === 'big' ? 420 : p.sizeName === 'middle' ? 320 : 240;
    const earned = Math.round(base * tq * (0.55 + p.positionQuality * 0.25 + p.pressureQuality * 0.20) * combo);
    score += earned;
    combo = clamp(combo + 0.22, 1, 4.5);
    addFloatingText(p.x, p.y - p.radius * 1.7, `+${earned}`, 'good');
    return earned;
  }

  function failPenalty(p, reason) {
    combo = 1;
    const loss = reason === 'damage' ? 120 : 45;
    score = Math.max(0, score - loss);
    addFloatingText(p.x, p.y - p.radius * 1.8, reason === 'damage' ? `-${loss} hurt` : `-${loss} early`, 'bad');
  }

  function completePimple(p) {
    if (p.state === 'popped') return;
    p.state = 'popped';
    p.pus = 0;
    p.wound = 0.18;
    p.compression = 0;
    scorePimple(p);
    addPusParticles(p, 26, 1.7);
    addRipple(p.x, p.y, p.radius * 3.1, 'pop');
    popSound();
    happyTime = 1.3;
    showFeedback('Nice! Clean pop. Pimple cleared.', 1500);
    updateMode('Clean pop', 'Choose another pimple or reset the face view.');
    const remaining = pimples.filter(item => item.state === 'ready').length;
    if (remaining === 0) {
      showFeedback(`Face cleared! Final score: ${Math.round(score)}`, 3600);
      updateMode('Finished', `Final score: ${Math.round(score)}. Restart to play again.`);
    }
  }

  function damagePimple(p) {
    if (p.state === 'damaged' || p.state === 'popped') return;
    p.state = 'damaged';
    p.damage = 1;
    p.wound = 1;
    p.compression = 0;
    failPenalty(p, 'damage');
    addPusParticles(p, 8, 0.45);
    addRipple(p.x, p.y, p.radius * 3.7, 'damage');
    hurtSound();
    flashDamage();
    shakeTime = 0.4;
    hurtTime = 1.4;
    showFeedback('Too long! Red wound. The face is not happy.', 1900);
    updateMode('Too much pressure', 'You held after the 3-second sweet spot. Pick another pimple.');
  }

  function earlyRelease(p) {
    if (p.state !== 'ready') return;
    p.squeezeTime = 0;
    p.pus = clamp(p.pus + 0.1, 0, 1);
    p.compression = 0;
    p.earlyReleased = true;
    failPenalty(p, 'early');
    showFeedback('Too short — still pus inside. Try holding closer to 3 seconds.', 1700);
    updateMode('Still inside', 'Hold longer, but release before it becomes red.');
  }

  function evaluateSqueezeFromTwoWorldPoints(a, b, dt) {
    const p = selectedPimple();
    if (!p || p.state !== 'ready') return false;
    const center = { x: p.x, y: p.y };
    const da = dist(a, center);
    const db = dist(b, center);
    const fingerGap = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const midDistance = dist(mid, center);
    const va = { x: a.x - p.x, y: a.y - p.y };
    const vb = { x: b.x - p.x, y: b.y - p.y };
    const dot = va.x * vb.x + va.y * vb.y;
    const mag = Math.max(1, Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y));
    const opposite = clamp((-dot / mag + 1) / 2, 0, 1);
    const idealGap = p.radius * 3.15;
    const gapQuality = 1 - Math.abs(fingerGap - idealGap) / (p.radius * 2.2);
    const centerQuality = 1 - midDistance / (p.radius * 1.2);
    const ringQualityA = 1 - Math.abs(da - p.radius * 1.55) / (p.radius * 1.45);
    const ringQualityB = 1 - Math.abs(db - p.radius * 1.55) / (p.radius * 1.45);
    const positionQuality = clamp(
      opposite * 0.44 + clamp(gapQuality, 0, 1) * 0.25 + clamp(centerQuality, 0, 1) * 0.18 + clamp((ringQualityA + ringQualityB) / 2, 0, 1) * 0.13,
      0,
      1
    );
    const pressureIdeal = p.radius * 2.52;
    const pressureQuality = clamp(1 - Math.abs(fingerGap - pressureIdeal) / (p.radius * 1.35), 0, 1);
    const goodEnough = positionQuality > 0.35 && pressureQuality > 0.22;
    p.positionQuality = lerp(p.positionQuality, positionQuality, 0.22);
    p.pressureQuality = lerp(p.pressureQuality, pressureQuality, 0.22);
    p.lastQuality = (p.positionQuality + p.pressureQuality) / 2;
    p.compression = lerp(p.compression, goodEnough ? clamp(1 - fingerGap / (p.radius * 4.2), 0, 0.7) : 0, 0.16);
    if (goodEnough) {
      const speed = 0.32 + p.positionQuality * 0.42 + p.pressureQuality * 0.38;
      p.squeezeTime += dt * speed;
      p.pus = clamp(1 - p.squeezeTime / TARGET_SECONDS, 0.08, 1);
      if (Math.random() < dt * (4 + p.squeezeTime * 1.2)) {
        addPusParticles(p, 1 + Math.floor(p.radius / 22), 0.55 + p.squeezeTime * 0.12);
        tinyPusSound();
      }
      if (p.squeezeTime >= DAMAGE_LIMIT) {
        damagePimple(p);
      }
      return true;
    }
    p.squeezeTime = Math.max(0, p.squeezeTime - dt * 0.85);
    p.compression = lerp(p.compression, 0, 0.2);
    return false;
  }

  function desktopSqueeze(dt) {
    const p = selectedPimple();
    if (!p || p.state !== 'ready') return;
    const holding = desktopHolding || spaceHeld;
    if (!holding) return;
    p.positionQuality = lerp(p.positionQuality, 0.82, 0.08);
    p.pressureQuality = lerp(p.pressureQuality, 0.76 + Math.sin(performance.now() * 0.006) * 0.1, 0.08);
    p.lastQuality = (p.positionQuality + p.pressureQuality) / 2;
    p.compression = lerp(p.compression, 0.48, 0.12);
    p.squeezeTime += dt * (0.82 + p.lastQuality * 0.25);
    p.pus = clamp(1 - p.squeezeTime / TARGET_SECONDS, 0.07, 1);
    if (Math.random() < dt * 8) {
      addPusParticles(p, 2, 0.8);
      tinyPusSound();
    }
    if (p.squeezeTime >= DAMAGE_LIMIT) {
      damagePimple(p);
    }
  }

  function releaseSelectedPimple() {
    const p = selectedPimple();
    if (!p || p.state !== 'ready') return;
    if (p.squeezeTime >= PERFECT_MIN && p.squeezeTime <= PERFECT_MAX) {
      completePimple(p);
    } else if (p.squeezeTime >= EARLY_LIMIT && p.squeezeTime < PERFECT_MIN) {
      completePimple(p);
      addFloatingText(p.x, p.y - p.radius * 2.25, 'barely!', 'ok');
    } else if (p.squeezeTime > PERFECT_MAX && p.squeezeTime < DAMAGE_LIMIT) {
      p.damage = 0.45;
      p.wound = 0.48;
      failPenalty(p, 'damage');
      flashDamage();
      hurtSound();
      p.squeezeTime = 0;
      p.compression = 0;
      showFeedback('A bit too long — red irritation. Try again on another pimple.', 1700);
    } else if (p.squeezeTime > 0.15) {
      earlyRelease(p);
    }
  }

  function update(dt) {
    if (camera.animating) {
      const t = 1 - Math.pow(0.0001, dt);
      camera.x = lerp(camera.x, camera.targetX, t);
      camera.y = lerp(camera.y, camera.targetY, t);
      camera.scale = lerp(camera.scale, camera.targetScale, t);
      if (Math.abs(camera.x - camera.targetX) < 0.5 && Math.abs(camera.y - camera.targetY) < 0.5 && Math.abs(camera.scale - camera.targetScale) < 0.01) {
        camera.x = camera.targetX;
        camera.y = camera.targetY;
        camera.scale = camera.targetScale;
        camera.animating = false;
      }
    }
    const now = performance.now();
    if (now > activeMessageUntil) {
      ui.feedbackToast.classList.add('hidden');
    }
    for (const p of pimples) {
      p.pulse += dt * (1.9 + p.radius * 0.008);
      if (p.state !== 'ready') {
        p.wound = clamp(p.wound - dt * 0.035, 0.12, 1);
      }
      if (p.state === 'ready') {
        p.positionQuality = Math.max(0, p.positionQuality - dt * 0.28);
        p.pressureQuality = Math.max(0, p.pressureQuality - dt * 0.24);
        p.compression = lerp(p.compression, 0, dt * 2.2);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const item = particles[i];
      item.age += dt;
      item.vy += 250 * dt;
      item.vx *= Math.pow(0.92, dt * 60);
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      if (item.age >= item.life) particles.splice(i, 1);
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const item = floatingTexts[i];
      item.age += dt;
      item.y += item.vy * dt;
      item.vy += 18 * dt;
      if (item.age >= item.life) floatingTexts.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const item = ripples[i];
      item.age += dt;
      if (item.age >= item.life) ripples.splice(i, 1);
    }
    shakeTime = Math.max(0, shakeTime - dt);
    blinkTime = Math.max(0, blinkTime - dt);
    happyTime = Math.max(0, happyTime - dt);
    hurtTime = Math.max(0, hurtTime - dt);
    desktopSqueeze(dt);
    updateUI();
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    drawBackground();
    let sx = 0;
    let sy = 0;
    if (shakeTime > 0) {
      sx = (Math.random() - 0.5) * 14 * shakeTime;
      sy = (Math.random() - 0.5) * 14 * shakeTime;
    }
    ctx.translate(width / 2 + sx, height / 2 + sy);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);
    drawWorldShadow();
    drawFace();
    drawPimples();
    drawParticles();
    drawRipples();
    drawFingerGuides();
    drawFloatingTexts();
    ctx.restore();
    drawOverlayVignette();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#17111f');
    g.addColorStop(0.5, '#23182e');
    g.addColorStop(1, '#0f111a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 25; i++) {
      const x = (i * 137.5 + performance.now() * 0.006) % (width + 200) - 100;
      const y = (i * 73.3) % (height + 120) - 60;
      ctx.beginPath();
      ctx.arc(x, y, 24 + (i % 6) * 8, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#ffb26b' : '#9c7cff';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWorldShadow() {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.ellipse(WORLD.faceX + 12, WORLD.faceY + 520, 315, 58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFace() {
    drawNeckAndShoulders();
    drawEars();
    drawHeadShape();
    drawSkinTexture();
    drawHair();
    drawEyebrows();
    drawEyes();
    drawNose();
    drawMouth();
    drawFaceHighlights();
  }

  function drawNeckAndShoulders() {
    ctx.save();
    const neck = ctx.createLinearGradient(420, 960, 580, 1280);
    neck.addColorStop(0, '#cf8b70');
    neck.addColorStop(1, '#a76457');
    ctx.fillStyle = neck;
    roundRect(405, 940, 190, 275, 70);
    ctx.fill();
    ctx.fillStyle = '#2e2638';
    ctx.beginPath();
    ctx.moveTo(175, 1360);
    ctx.quadraticCurveTo(500, 1160, 825, 1360);
    ctx.lineTo(900, 1490);
    ctx.lineTo(100, 1490);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEars() {
    ctx.save();
    ctx.fillStyle = '#c98570';
    ctx.strokeStyle = 'rgba(105, 50, 48, 0.32)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(197, 670, 62, 102, -0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(803, 670, 62, 102, 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(120,55,55,0.28)';
    ctx.beginPath();
    ctx.arc(202, 668, 32, -1.2, 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(798, 668, 32, 1.95, 4.35);
    ctx.stroke();
    ctx.restore();
  }

  function drawHeadShape() {
    ctx.save();
    const skin = ctx.createRadialGradient(430, 510, 80, WORLD.faceX, WORLD.faceY, 540);
    skin.addColorStop(0, '#f0b28e');
    skin.addColorStop(0.55, '#ce8870');
    skin.addColorStop(1, '#a95e55');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(500, 205);
    ctx.bezierCurveTo(315, 205, 215, 350, 215, 610);
    ctx.bezierCurveTo(215, 940, 330, 1130, 500, 1185);
    ctx.bezierCurveTo(670, 1130, 785, 940, 785, 610);
    ctx.bezierCurveTo(785, 350, 685, 205, 500, 205);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,35,35,0.32)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }

  function drawSkinTexture() {
    ctx.save();
    for (const pore of decorativePores) {
      ctx.globalAlpha = pore.alpha;
      ctx.fillStyle = '#5d2d34';
      ctx.beginPath();
      ctx.ellipse(pore.x, pore.y, pore.r, pore.r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.055;
    ctx.strokeStyle = '#fff1e0';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      const y = 350 + i * 38;
      ctx.beginPath();
      ctx.moveTo(290 + Math.sin(i) * 8, y);
      ctx.quadraticCurveTo(500, y + Math.cos(i * 0.7) * 18, 710 + Math.cos(i) * 8, y + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHair() {
    ctx.save();
    ctx.fillStyle = '#24171b';
    ctx.beginPath();
    ctx.moveTo(220, 420);
    ctx.bezierCurveTo(230, 220, 385, 135, 525, 158);
    ctx.bezierCurveTo(685, 180, 787, 290, 785, 465);
    ctx.bezierCurveTo(712, 385, 642, 358, 555, 330);
    ctx.bezierCurveTo(462, 370, 340, 345, 220, 420);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(285 + i * 38, 260 + Math.sin(i) * 20);
      ctx.quadraticCurveTo(350 + i * 25, 210 + Math.cos(i) * 40, 420 + i * 23, 330 + Math.sin(i * 0.6) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEyebrows() {
    ctx.save();
    ctx.strokeStyle = '#2a1717';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(330, 520);
    ctx.quadraticCurveTo(395, 492, 458, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(542, 512);
    ctx.quadraticCurveTo(607, 492, 670, 520);
    ctx.stroke();
    ctx.restore();
  }

  function drawEyes() {
    ctx.save();
    const unhappy = hurtTime > 0;
    const happy = happyTime > 0;
    ctx.fillStyle = 'rgba(255,245,235,0.94)';
    drawEye(393, 573, unhappy ? -0.12 : 0.03, happy);
    drawEye(607, 573, unhappy ? 0.12 : -0.03, happy);
    ctx.restore();
  }

  function drawEye(x, y, tilt, happy) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.ellipse(0, 0, 54, happy ? 18 : 24, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff1e8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,30,30,0.35)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 2, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#2c1c23';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, -4, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fill();
    ctx.restore();
  }

  function drawNose() {
    ctx.save();
    ctx.strokeStyle = 'rgba(100,45,45,0.28)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(502, 610);
    ctx.bezierCurveTo(530, 690, 528, 737, 500, 760);
    ctx.stroke();
    ctx.fillStyle = 'rgba(80,35,35,0.26)';
    ctx.beginPath();
    ctx.ellipse(465, 766, 18, 8, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(535, 766, 18, 8, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMouth() {
    ctx.save();
    ctx.strokeStyle = '#5f2630';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (hurtTime > 0) {
      ctx.moveTo(430, 955);
      ctx.quadraticCurveTo(500, 910, 570, 955);
    } else if (happyTime > 0) {
      ctx.moveTo(420, 920);
      ctx.quadraticCurveTo(500, 990, 580, 920);
    } else {
      ctx.moveTo(430, 930);
      ctx.quadraticCurveTo(500, 950, 570, 930);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFaceHighlights() {
    ctx.save();
    ctx.globalAlpha = 0.17;
    const g = ctx.createRadialGradient(382, 455, 20, 380, 460, 250);
    g.addColorStop(0, 'white');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(420, 555, 145, 245, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPimples() {
    for (const p of pimples) {
      drawPimple(p);
    }
  }

  function drawPimple(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const selected = p.id === selectedId;
    const pulse = Math.sin(p.pulse) * 0.035;
    const squeezeX = 1 + p.compression * 0.42;
    const squeezeY = 1 - p.compression * 0.36;
    const stateScale = p.state === 'popped' ? 0.86 : 1;
    ctx.scale(squeezeX * stateScale, squeezeY * stateScale);
    drawPimpleAura(p, selected, pulse);
    drawPimpleIrregularBase(p, pulse);
    drawPimpleRedness(p);
    drawPimpleVeins(p);
    drawPimpleCore(p);
    drawPimplePores(p);
    drawPimpleHighlights(p);
    drawPimpleState(p);
    if (selected && p.state === 'ready') drawSelectedRing(p);
    ctx.restore();
  }

  function drawPimpleAura(p, selected, pulse) {
    const r = p.radius;
    ctx.save();
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.15);
    const alpha = selected ? 0.42 : 0.22;
    g.addColorStop(0, `rgba(255, 85, 84, ${alpha})`);
    g.addColorStop(0.52, `rgba(220, 46, 70, ${alpha * 0.35})`);
    g.addColorStop(1, 'rgba(220, 46, 70, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (2.25 + pulse), r * (1.75 + pulse), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPimpleIrregularBase(p, pulse) {
    const r = p.radius;
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.08, 0, 0, r * 1.25);
    if (p.state === 'damaged') {
      grad.addColorStop(0, '#ffb2a0');
      grad.addColorStop(0.45, '#d73743');
      grad.addColorStop(1, '#8f1526');
    } else if (p.state === 'popped') {
      grad.addColorStop(0, '#d38b78');
      grad.addColorStop(0.45, '#a84d50');
      grad.addColorStop(1, '#7a303b');
    } else {
      grad.addColorStop(0, '#ffd2a1');
      grad.addColorStop(0.38, '#e7585d');
      grad.addColorStop(0.72, '#ba293f');
      grad.addColorStop(1, '#7a1d32');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    const steps = 34;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const noise = 1 + Math.sin(a * 3 + p.seed) * 0.06 + Math.cos(a * 5 + p.seed * 0.7) * 0.045 + pulse;
      const rx = r * noise * (1.05 + Math.sin(a + p.seed) * 0.02);
      const ry = r * noise * (0.88 + Math.cos(a * 2) * 0.04);
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.strokeStyle = 'rgba(100, 12, 32, 0.42)';
    ctx.stroke();
    for (const bump of p.bumps) {
      const x = Math.cos(bump.a) * bump.r;
      const y = Math.sin(bump.a) * bump.r * 0.82;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#fff1d0';
      ctx.beginPath();
      ctx.ellipse(x, y, bump.size, bump.size * 0.55, bump.a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPimpleRedness(p) {
    const r = p.radius;
    ctx.save();
    ctx.globalAlpha = p.state === 'damaged' ? 0.52 : 0.25 + p.squeezeTime * 0.035;
    ctx.strokeStyle = '#6e1026';
    ctx.lineWidth = Math.max(1, r * 0.035);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const start = (i * Math.PI * 2) / 5 + p.seed * 0.01;
      ctx.arc(0, 0, r * (0.75 + i * 0.12), start, start + 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPimpleVeins(p) {
    const r = p.radius;
    ctx.save();
    ctx.strokeStyle = 'rgba(95, 0, 28, 0.38)';
    ctx.lineWidth = Math.max(0.9, r * 0.035);
    ctx.lineCap = 'round';
    for (const vein of p.veins) {
      const sx = Math.cos(vein.a) * vein.start;
      const sy = Math.sin(vein.a) * vein.start * 0.82;
      const ex = Math.cos(vein.a) * vein.end;
      const ey = Math.sin(vein.a) * vein.end * 0.82;
      const cx = Math.cos(vein.a + vein.curve) * (vein.start + vein.end) * 0.5;
      const cy = Math.sin(vein.a + vein.curve) * (vein.start + vein.end) * 0.36;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPimpleCore(p) {
    const r = p.radius;
    ctx.save();
    const pusAmount = p.state === 'ready' ? p.pus : 0.06;
    const coreR = r * (0.28 + pusAmount * 0.22);
    const g = ctx.createRadialGradient(-coreR * 0.28, -coreR * 0.32, coreR * 0.08, 0, 0, coreR * 1.2);
    g.addColorStop(0, '#fff6bf');
    g.addColorStop(0.46, '#f9d761');
    g.addColorStop(1, '#a86b24');
    ctx.globalAlpha = p.state === 'damaged' ? 0.55 : 0.92;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, coreR * (1 + p.compression * 0.25), coreR * (0.82 - p.compression * 0.16), 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(85,45,0,0.26)';
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.stroke();
    if (p.squeezeTime > 0.5 && p.state === 'ready') {
      ctx.globalAlpha = clamp(p.squeezeTime / TARGET_SECONDS, 0, 0.8);
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath();
      ctx.ellipse(0, -coreR * 1.2 - p.squeezeTime * 3, coreR * 0.52, coreR * 0.28, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPimplePores(p) {
    const r = p.radius;
    ctx.save();
    for (const pore of p.pores) {
      ctx.globalAlpha = pore.dark * 0.5;
      ctx.fillStyle = '#4b1723';
      ctx.beginPath();
      ctx.ellipse(pore.x, pore.y, pore.r, pore.r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.11;
      ctx.fillStyle = '#fff7df';
      ctx.beginPath();
      ctx.ellipse(pore.x - pore.r * 0.35, pore.y - pore.r * 0.28, pore.r * 0.45, pore.r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPimpleHighlights(p) {
    const r = p.radius;
    ctx.save();
    for (const h of p.shine) {
      ctx.globalAlpha = h.alpha;
      ctx.fillStyle = '#fff8e9';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, h.rx, h.ry, -0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.1, r * 0.66, -2.45, -0.72);
    ctx.stroke();
    ctx.restore();
  }

  function drawPimpleState(p) {
    const r = p.radius;
    if (p.state === 'popped') {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#6c2432';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.52, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,190,0.45)';
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0.2, Math.PI * 1.7);
      ctx.stroke();
      ctx.restore();
    }
    if (p.state === 'damaged') {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#3e0715';
      ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.48, -r * 0.1);
      ctx.quadraticCurveTo(-r * 0.08, r * 0.2, r * 0.42, -r * 0.02);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,80,80,0.5)';
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSelectedRing(p) {
    const r = p.radius;
    ctx.save();
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.06;
    ctx.strokeStyle = 'rgba(255,255,255,0.84)';
    ctx.lineWidth = Math.max(2.5, r * 0.055);
    ctx.setLineDash([r * 0.3, r * 0.18]);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 2.0 * pulse, r * 1.62 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(12, r * 0.38)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('squeeze here', 0, -r * 2.0);
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const item of particles) {
      const t = item.age / item.life;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = item.color === 'pus' ? '#ffe66b' : '#fff7c9';
      ctx.beginPath();
      ctx.ellipse(item.x, item.y, item.r * (1 + t), item.r * (0.72 + t * 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(133,86,16,0.25)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRipples() {
    ctx.save();
    for (const item of ripples) {
      const t = item.age / item.life;
      const rr = item.r * (0.45 + t * 0.8);
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = item.type === 'damage' ? 7 : 4;
      ctx.strokeStyle = item.type === 'damage' ? 'rgba(255,42,42,0.74)' : item.type === 'pop' ? 'rgba(255,245,160,0.86)' : 'rgba(255,255,255,0.68)';
      ctx.beginPath();
      ctx.ellipse(item.x, item.y, rr, rr * 0.76, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFingerGuides() {
    const p = selectedPimple();
    if (!p || p.state !== 'ready') return;
    if (camera.scale < 2.1) return;
    const r = p.radius;
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.006) * 0.12;
    ctx.strokeStyle = 'rgba(120,220,255,0.65)';
    ctx.lineWidth = Math.max(2, r * 0.045);
    ctx.setLineDash([r * 0.2, r * 0.2]);
    ctx.beginPath();
    ctx.arc(p.x - r * 1.55, p.y, r * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x + r * 1.55, p.y, r * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `${Math.max(12, r * 0.28)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('finger', p.x - r * 1.55, p.y + r * 0.85);
    ctx.fillText('finger', p.x + r * 1.55, p.y + r * 0.85);
    ctx.restore();
  }

  function drawFloatingTexts() {
    ctx.save();
    for (const item of floatingTexts) {
      const t = item.age / item.life;
      ctx.globalAlpha = 1 - t;
      ctx.font = 'bold 34px system-ui';
      ctx.textAlign = 'center';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.fillStyle = item.mood === 'bad' ? '#ff7676' : item.mood === 'ok' ? '#ffe66d' : '#b9ffbc';
      ctx.strokeText(item.text, item.x, item.y);
      ctx.fillText(item.text, item.x, item.y);
    }
    ctx.restore();
  }

  function drawOverlayVignette() {
    ctx.save();
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.27)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function getCanvasPointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function getCanvasPointFromTouch(touch) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  function canvasTouches(event) {
    const arr = [];
    for (const t of event.touches) {
      arr.push({ id: t.identifier, ...getCanvasPointFromTouch(t) });
    }
    return arr;
  }

  function handleTouchStart(event) {
    initAudio();
    event.preventDefault();
    const touches = canvasTouches(event);
    for (const t of touches) {
      touchState.touches.set(t.id, t);
    }
    if (touches.length === 1) {
      touchState.mode = 'tap-or-pan';
      touchState.movedSinceStart = false;
      touchState.lastMid = { x: touches[0].x, y: touches[0].y };
      touchState.twoFingerStartTime = 0;
    }
    if (touches.length >= 2) {
      const a = touches[0];
      const b = touches[1];
      touchState.mode = 'pinch-or-squeeze';
      touchState.lastDistance = Math.hypot(a.x - b.x, a.y - b.y);
      touchState.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      touchState.twoFingerStartTime = performance.now();
      touchState.squeezeCandidate = false;
    }
  }

  function handleTouchMove(event) {
    initAudio();
    event.preventDefault();
    const touches = canvasTouches(event);
    if (touches.length === 1) {
      const t = touches[0];
      if (!touchState.lastMid) {
        touchState.lastMid = { x: t.x, y: t.y };
        return;
      }
      const dx = t.x - touchState.lastMid.x;
      const dy = t.y - touchState.lastMid.y;
      if (Math.hypot(dx, dy) > 4) touchState.movedSinceStart = true;
      camera.x -= dx / camera.scale;
      camera.y -= dy / camera.scale;
      camera.targetX = camera.x;
      camera.targetY = camera.y;
      camera.animating = false;
      clampCamera();
      touchState.lastMid = { x: t.x, y: t.y };
      return;
    }
    if (touches.length >= 2) {
      const a = touches[0];
      const b = touches[1];
      const distanceNow = Math.hypot(a.x - b.x, a.y - b.y);
      const midNow = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const selected = selectedPimple();
      let handledAsSqueeze = false;
      if (selected && selected.state === 'ready') {
        const aw = screenToWorld(a);
        const bw = screenToWorld(b);
        const movement = touchState.lastDistance ? Math.abs(distanceNow - touchState.lastDistance) : 0;
        const centerScreen = worldToScreen({ x: selected.x, y: selected.y });
        const midScreenD = Math.hypot(midNow.x - centerScreen.x, midNow.y - centerScreen.y);
        const closeToPimple = midScreenD < selected.radius * camera.scale * 1.8 + 80;
        if (closeToPimple && movement < 14) {
          touchState.squeezeCandidate = true;
          handledAsSqueeze = evaluateSqueezeFromTwoWorldPoints(aw, bw, 1 / 60);
        }
      }
      if (!handledAsSqueeze) {
        if (touchState.lastDistance > 0) {
          const factor = distanceNow / touchState.lastDistance;
          zoomAtScreenPoint(midNow, factor);
        }
        if (touchState.lastMid) {
          const dx = midNow.x - touchState.lastMid.x;
          const dy = midNow.y - touchState.lastMid.y;
          camera.x -= dx / camera.scale;
          camera.y -= dy / camera.scale;
          camera.targetX = camera.x;
          camera.targetY = camera.y;
          camera.animating = false;
          clampCamera();
        }
      }
      touchState.lastDistance = distanceNow;
      touchState.lastMid = midNow;
    }
  }

  function handleTouchEnd(event) {
    event.preventDefault();
    const remaining = canvasTouches(event);
    const now = performance.now();
    if (touchState.mode === 'tap-or-pan' && !touchState.movedSinceStart && remaining.length === 0 && touchState.lastMid) {
      const world = screenToWorld(touchState.lastMid);
      const p = findPimpleAt(world);
      if (p) {
        bumpCameraToPimple(p);
      }
    }
    if (touchState.mode === 'pinch-or-squeeze' && remaining.length < 2) {
      const p = selectedPimple();
      if (p && p.squeezeTime > 0.12) releaseSelectedPimple();
    }
    touchState.touches.clear();
    for (const t of remaining) touchState.touches.set(t.id, t);
    if (remaining.length === 1) {
      touchState.mode = 'tap-or-pan';
      touchState.lastMid = { x: remaining[0].x, y: remaining[0].y };
      touchState.movedSinceStart = false;
    } else if (remaining.length >= 2) {
      const a = remaining[0];
      const b = remaining[1];
      touchState.mode = 'pinch-or-squeeze';
      touchState.lastDistance = Math.hypot(a.x - b.x, a.y - b.y);
      touchState.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      touchState.twoFingerStartTime = now;
    } else {
      touchState.mode = 'none';
      touchState.lastMid = null;
      touchState.lastDistance = 0;
      touchState.squeezeCandidate = false;
    }
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'touch') return;
    initAudio();
    pointerDown = true;
    desktopHolding = false;
    mouseStart = getCanvasPointFromEvent(event);
    mouseCurrent = mouseStart;
    dragLast = mouseStart;
    isDragging = false;
    const downWorld = screenToWorld(mouseStart);
    const selected = selectedPimple();
    if (selected && selected.state === 'ready' && camera.scale > 2.1) {
      const distanceToSelected = Math.hypot(downWorld.x - selected.x, downWorld.y - selected.y);
      if (distanceToSelected < selected.radius * 2.15) {
        desktopHolding = true;
      }
    }
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (event.pointerType === 'touch') return;
    mouseCurrent = getCanvasPointFromEvent(event);
    if (!pointerDown || !dragLast) return;
    const dx = mouseCurrent.x - dragLast.x;
    const dy = mouseCurrent.y - dragLast.y;
    if (Math.hypot(mouseCurrent.x - mouseStart.x, mouseCurrent.y - mouseStart.y) > 5) {
      isDragging = true;
      desktopHolding = false;
    }
    if (isDragging) {
      camera.x -= dx / camera.scale;
      camera.y -= dy / camera.scale;
      camera.targetX = camera.x;
      camera.targetY = camera.y;
      camera.animating = false;
      clampCamera();
    }
    dragLast = mouseCurrent;
  }

  function handlePointerUp(event) {
    if (event.pointerType === 'touch') return;
    pointerDown = false;
    const wasDesktopHolding = desktopHolding;
    desktopHolding = false;
    if (wasDesktopHolding) {
      releaseSelectedPimple();
    } else if (!isDragging && mouseStart) {
      const world = screenToWorld(mouseStart);
      const p = findPimpleAt(world);
      const selected = selectedPimple();
      if (p) {
        if (!selected || selected.id !== p.id || camera.scale <= 2.1) {
          bumpCameraToPimple(p);
        }
      } else if (selected && selected.squeezeTime > 0) {
        releaseSelectedPimple();
      }
    } else {
      if (selectedPimple() && selectedPimple().squeezeTime > 0) releaseSelectedPimple();
    }
    mouseStart = null;
    dragLast = null;
    isDragging = false;
  }

  function handleWheel(event) {
    event.preventDefault();
    initAudio();
    const point = getCanvasPointFromEvent(event);
    const factor = Math.exp(-event.deltaY * 0.0012);
    zoomAtScreenPoint(point, factor);
  }

  function handleKeyDown(event) {
    initAudio();
    if (event.code === 'Space') {
      event.preventDefault();
      spaceHeld = true;
    }
    if (event.key === '+' || event.key === '=') {
      const p = selectedPimple();
      const center = p ? worldToScreen({ x: p.x, y: p.y }) : { x: width / 2, y: height / 2 };
      zoomAtScreenPoint(center, 1.18);
    }
    if (event.key === '-') {
      const p = selectedPimple();
      const center = p ? worldToScreen({ x: p.x, y: p.y }) : { x: width / 2, y: height / 2 };
      zoomAtScreenPoint(center, 0.84);
    }
    if (event.key.toLowerCase() === 'f') {
      focusSelectedOrBest();
    }
  }

  function handleKeyUp(event) {
    if (event.code === 'Space') {
      event.preventDefault();
      spaceHeld = false;
      releaseSelectedPimple();
    }
  }

  function focusSelectedOrBest() {
    const p = selectedPimple() || pimples.find(item => item.state === 'ready');
    if (p) bumpCameraToPimple(p);
  }

  function restart() {
    score = 0;
    combo = 1;
    selectedId = null;
    particles.length = 0;
    floatingTexts.length = 0;
    ripples.length = 0;
    pimples = createPimples();
    fitFullFace(true);
    showFeedback('Restarted. Tap a pimple to focus.', 1500);
  }

  function wireEvents() {
    window.addEventListener('resize', resize);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    ui.focusButton.addEventListener('click', () => { initAudio(); focusSelectedOrBest(); });
    ui.zoomInButton.addEventListener('click', () => {
      initAudio();
      const p = selectedPimple();
      const center = p ? worldToScreen({ x: p.x, y: p.y }) : { x: width / 2, y: height / 2 };
      zoomAtScreenPoint(center, 1.24);
    });
    ui.zoomOutButton.addEventListener('click', () => {
      initAudio();
      const p = selectedPimple();
      const center = p ? worldToScreen({ x: p.x, y: p.y }) : { x: width / 2, y: height / 2 };
      zoomAtScreenPoint(center, 0.78);
    });
    ui.resetViewButton.addEventListener('click', () => { initAudio(); fitFullFace(true); });
    ui.restartButton.addEventListener('click', () => { initAudio(); restart(); });
  }

  function loop(now) {
    const dt = clamp((now - lastTime) / 1000, 0.001, 0.04);
    lastTime = now;
    update(dt);
    draw();
    PusFX.update(1);
  PusFX.draw(ctx);
  requestAnimationFrame(loop);
  }

  function boot() {
    createDecorativePores();
    resize();
    fitFullFace(false);
    wireEvents();
    showFeedback('Tap a pimple. It will zoom and center.', 2100);
    requestAnimationFrame(loop);
  }

  boot();
})();


/*
=====================================================================
COMPATIBILITY HOOKS FOR EXISTING GAME LOGIC
=====================================================================
The previous game versions use different internal function names.
This safe hook watches the current selected pimple and squeeze progress.
It adds realistic pus feedback without breaking the old scoring logic.
=====================================================================
*/

let __lastPusSelectedId = null;
let __lastPusProgressBucket = 0;
let __pusBurstDoneFor = new Set();

function getCurrentPimpleForPusFX() {
  const candidates = [
    typeof selectedPimple !== "undefined" ? selectedPimple : null,
    typeof activePimple !== "undefined" ? activePimple : null,
    typeof focusedPimple !== "undefined" ? focusedPimple : null,
    typeof currentPimple !== "undefined" ? currentPimple : null
  ].filter(Boolean);
  if (candidates.length) return candidates[0];

  if (typeof pimples !== "undefined" && Array.isArray(pimples)) {
    return pimples.find(p => p && (p.selected || p.active || p.focused || p.isFocused || p.state === "active" || p.state === "squeezing")) || null;
  }
  return null;
}

function getPusProgressGuess() {
  const values = [
    typeof squeezeProgress !== "undefined" ? squeezeProgress : null,
    typeof popProgress !== "undefined" ? popProgress : null,
    typeof holdProgress !== "undefined" ? holdProgress : null,
    typeof currentPopProgress !== "undefined" ? currentPopProgress : null,
    typeof squeezeTime !== "undefined" ? Math.min(1, squeezeTime / 3000) : null,
    typeof holdTime !== "undefined" ? Math.min(1, holdTime / 3000) : null
  ].filter(v => typeof v === "number" && isFinite(v));
  if (values.length) return Math.max(0, Math.min(1.25, values[0]));

  if (typeof gameState !== "undefined" && gameState) {
    for (const key of ["squeezeProgress", "popProgress", "holdProgress"]) {
      if (typeof gameState[key] === "number") return Math.max(0, Math.min(1.25, gameState[key]));
    }
  }
  return 0;
}

function realisticPusWatcher() {
  const p = getCurrentPimpleForPusFX();
  if (p) {
    const id = p.id ?? p.index ?? `${p.x}_${p.y}`;
    if (__lastPusSelectedId !== id) {
      __lastPusSelectedId = id;
      __lastPusProgressBucket = 0;
      triggerRealisticPusStart(p);
    }

    const progress = getPusProgressGuess();
    const bucket = Math.floor(progress * 12);
    if (bucket > __lastPusProgressBucket) {
      __lastPusProgressBucket = bucket;
      triggerRealisticPusPressure(p, progress);
    }

    const popped = p.popped || p.done || p.state === "popped" || progress >= 0.96;
    if (popped && !__pusBurstDoneFor.has(id)) {
      __pusBurstDoneFor.add(id);
      triggerRealisticPusBurst(p, Math.min(1, Math.max(0.35, progress)));
    }
  }
  requestAnimationFrame(realisticPusWatcher);
}
requestAnimationFrame(realisticPusWatcher);
