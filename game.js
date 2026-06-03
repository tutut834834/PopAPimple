const pimplesSeed = [
  { id: 1, x: 202, y: 245, size: 'small', r: 9,  target: 3.0 },
  { id: 2, x: 340, y: 238, size: 'small', r: 9,  target: 3.0 },
  { id: 3, x: 258, y: 298, size: 'small', r: 10, target: 3.0 },
  { id: 4, x: 180, y: 386, size: 'medium', r: 15, target: 3.0 },
  { id: 5, x: 360, y: 390, size: 'medium', r: 15, target: 3.0 },
  { id: 6, x: 285, y: 470, size: 'medium', r: 16, target: 3.0 },
  { id: 7, x: 225, y: 550, size: 'big', r: 22, target: 3.0 },
  { id: 8, x: 338, y: 540, size: 'big', r: 22, target: 3.0 },
  { id: 9, x: 420, y: 335, size: 'big', r: 23, target: 3.0 }
];

const svg = document.getElementById('faceSvg');
const world = document.getElementById('faceWorld');
const layer = document.getElementById('pimpleLayer');
const gameArea = document.getElementById('gameArea');
const fingerA = document.getElementById('fingerA');
const fingerB = document.getElementById('fingerB');
const pusStream = document.getElementById('pusStream');
const popBurst = document.getElementById('popBurst');
const floatingText = document.getElementById('floatingText');
const feedback = document.getElementById('feedback');
const scoreEl = document.getElementById('score');
const leftEl = document.getElementById('leftCount');
const comboEl = document.getElementById('combo');
const timeBar = document.getElementById('timeBar');
const posBar = document.getElementById('posBar');
const pressureBar = document.getElementById('pressureBar');
const timerText = document.getElementById('timerText');
const redFlash = document.getElementById('redFlash');
const mouth = document.getElementById('mouth');
const restartBtn = document.getElementById('restartBtn');
const backBtn = document.getElementById('backBtn');
const targetRing = document.getElementById('targetRing');
const modeHint = document.getElementById('modeHint');
const zoomReadout = document.getElementById('zoomReadout');

let pimples = [];
let focus = null;
let active = null;
let startTime = 0;
let rafId = null;
let score = 0;
let combo = 1;
let pointerMode = false;
let currentPointer = { x: 0, y: 0 };
let touchPair = null;
let audioCtx = null;
let soundReady = false;

let cam = { scale: 1, tx: 0, ty: 0 };
let gesture = null;
let pendingSqueeze = null;
let mouseDrag = null;

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  soundReady = true;
}

function playTone(type = 'pop') {
  if (!soundReady || !audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  if (type === 'pop') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.055);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.start(now); osc.stop(now + 0.24);
  } else if (type === 'hurt') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(55, now + 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc.start(now); osc.stop(now + 0.4);
  } else {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.linearRampToValueAtTime(180, now + 0.22);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.start(now); osc.stop(now + 0.26);
  }
}

function svgPointFromClient(clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}
function facePointFromClient(clientX, clientY) {
  const p = svgPointFromClient(clientX, clientY);
  return { x: (p.x - cam.tx) / cam.scale, y: (p.y - cam.ty) / cam.scale };
}
function screenPointFromFace(x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x * cam.scale + cam.tx;
  pt.y = y * cam.scale + cam.ty;
  const p = pt.matrixTransform(svg.getScreenCTM());
  const rect = gameArea.getBoundingClientRect();
  return { x: p.x - rect.left, y: p.y - rect.top };
}
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

function applyCam() {
  cam.scale = clamp(cam.scale, 0.8, 8.5);
  world.setAttribute('transform', `translate(${cam.tx} ${cam.ty}) scale(${cam.scale})`);
  zoomReadout.textContent = `Zoom x${cam.scale.toFixed(1)}`;
  positionZoomUI();
}
function zoomAt(svgPt, factor) {
  const old = cam.scale;
  const next = clamp(old * factor, 0.8, 8.5);
  factor = next / old;
  cam.tx = svgPt.x - (svgPt.x - cam.tx) * factor;
  cam.ty = svgPt.y - (svgPt.y - cam.ty) * factor;
  cam.scale = next;
  applyCam();
}
function centerOnPimple(p, scale = 4.8) {
  cam.scale = clamp(scale, 0.8, 8.5);
  cam.tx = 280 - p.x * cam.scale;
  cam.ty = 360 - p.y * cam.scale;
  applyCam();
}
function resetCam() {
  cam = { scale: 1, tx: 0, ty: 0 };
  applyCam();
}

function buildPimples() {
  layer.innerHTML = '';
  pimples = pimplesSeed.map(p => ({ ...p, state: 'unpopped' }));
  for (const p of pimples) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('pimple', 'unpopped');
    g.dataset.id = p.id;
    g.innerHTML = `
      <circle class="wound" cx="${p.x}" cy="${p.y}" r="${p.r * 1.45}"></circle>
      <circle class="core" cx="${p.x}" cy="${p.y}" r="${p.r}"></circle>
      <circle class="shine" cx="${p.x - p.r * 0.32}" cy="${p.y - p.r * 0.38}" r="${Math.max(3, p.r * 0.24)}"></circle>
      <circle class="hit" cx="${p.x}" cy="${p.y}" r="${p.r + 28}" fill="transparent"></circle>
    `;
    g.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') selectPimple(e, p.id);
    });
    layer.appendChild(g);
  }
}

function updateStats() {
  scoreEl.textContent = score;
  leftEl.textContent = pimples.filter(p => p.state === 'unpopped').length;
  comboEl.textContent = `x${combo}`;
}
function setBars(timing, pos, pressure) {
  timeBar.style.width = `${clamp(timing * 100, 0, 100)}%`;
  posBar.style.width = `${clamp(pos * 100, 0, 100)}%`;
  pressureBar.style.width = `${clamp(pressure * 100, 0, 100)}%`;
}
function getPimpleElement(id) { return layer.querySelector(`[data-id="${id}"]`); }

function selectPimple(e, id) {
  e.preventDefault();
  ensureAudio();
  if (active) return;
  const p = pimples.find(q => q.id === id && q.state === 'unpopped');
  if (!p) return;
  focusPimple(p);
}
function pimpleAtFacePoint(pt) {
  let best = null, bestD = Infinity;
  for (const p of pimples) {
    if (p.state !== 'unpopped') continue;
    const d = distance(pt, p);
    if (d < p.r + 28 && d < bestD) { best = p; bestD = d; }
  }
  return best;
}
function focusPimple(p) {
  focus = p;
  document.querySelectorAll('.pimple').forEach(el => el.classList.remove('focused'));
  getPimpleElement(p.id)?.classList.add('focused');
  centerOnPimple(p, gameArea.clientWidth < 530 ? 6.2 : 5.0);
  targetRing.classList.add('show');
  backBtn.classList.add('show');
  modeHint.textContent = 'Pinch zoom in/out, then hold two fingers around it';
  feedback.innerHTML = `Focused on a <b>${p.size}</b> pimple. Use two fingers to <b>pinch zoom in/out</b>. When ready, hold two fingers left/right of the pimple for <b>3 seconds</b>.`;
  setBars(0,0,0);
  timerText.textContent = '0.0';
}
function positionZoomUI() {
  if (!focus) return;
  const center = screenPointFromFace(focus.x, focus.y);
  targetRing.style.left = `${center.x}px`;
  targetRing.style.top = `${center.y}px`;
  const ringSize = clamp(focus.r * cam.scale * 8.5, 160, 310);
  targetRing.style.width = `${ringSize}px`;
  targetRing.style.height = `${ringSize}px`;
}
function clearZoom() {
  if (active) endSqueeze();
  focus = null;
  resetCam();
  targetRing.classList.remove('show');
  backBtn.classList.remove('show');
  hideFingers();
  document.querySelectorAll('.pimple').forEach(el => el.classList.remove('focused'));
  modeHint.textContent = 'Tap pimple • pinch to zoom • hold two fingers to pop';
  feedback.innerHTML = 'Tap a pimple first. Then pinch zoom in/out with two fingers until it is big enough.';
  timerText.textContent = '0.0';
  setBars(0,0,0);
}

function startSqueezeFromTouches(touches) {
  if (!focus || active || touches.length < 2) return false;
  ensureAudio();
  const a = facePointFromClient(touches[0].clientX, touches[0].clientY);
  const b = facePointFromClient(touches[1].clientX, touches[1].clientY);
  const mid = midpoint(a, b);
  if (distance(mid, focus) > focus.r * 5.0) return false;
  active = focus;
  pointerMode = false;
  touchPair = [a, b];
  startTime = performance.now();
  feedback.innerHTML = `Squeezing... keep fingers steady and release around <b>3 seconds</b>. Pus should flow while you hold.`;
  loop();
  return true;
}

function handleTouchStart(e) {
  ensureAudio();
  if (e.touches.length === 1 && !active) {
    const p = facePointFromClient(e.touches[0].clientX, e.touches[0].clientY);
    const hit = pimpleAtFacePoint(p);
    if (hit) { e.preventDefault(); focusPimple(hit); return; }
  }
  if (e.touches.length >= 2 && !active) {
    e.preventDefault();
    const p1 = svgPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
    const p2 = svgPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
    const midSvg = midpoint(p1, p2);
    gesture = {
      dist: distance(p1, p2),
      mid: midSvg,
      scale: cam.scale,
      tx: cam.tx,
      ty: cam.ty,
      moved: false,
      startTime: performance.now(),
      lastDist: distance(p1, p2),
      lastMid: midSvg
    };
    pendingSqueeze = { start: performance.now(), startDist: gesture.dist, startMid: midSvg };
  }
}
function handleTouchMove(e) {
  if (active && !pointerMode && e.touches.length >= 2) {
    e.preventDefault();
    touchPair = [
      facePointFromClient(e.touches[0].clientX, e.touches[0].clientY),
      facePointFromClient(e.touches[1].clientX, e.touches[1].clientY)
    ];
    return;
  }
  if (e.touches.length >= 2 && gesture && !active) {
    e.preventDefault();
    const p1 = svgPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
    const p2 = svgPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
    const newDist = distance(p1, p2);
    const newMid = midpoint(p1, p2);
    const distChange = Math.abs(newDist - gesture.dist);
    const midMove = distance(newMid, gesture.mid);

    if (distChange > 8 || midMove > 8) {
      gesture.moved = true;
      pendingSqueeze = null;
      const newScale = clamp(gesture.scale * (newDist / Math.max(gesture.dist, 1)), 0.8, 8.5);
      const factor = newScale / gesture.scale;
      cam.scale = newScale;
      cam.tx = newMid.x - (gesture.mid.x - gesture.tx) * factor;
      cam.ty = newMid.y - (gesture.mid.y - gesture.ty) * factor;
      applyCam();
      modeHint.textContent = `Pinch zoom active: x${cam.scale.toFixed(1)}`;
    }
    return;
  }
}
function handleTouchEnd(e) {
  if (active) { endSqueeze(e); return; }
  if (pendingSqueeze && e.changedTouches.length >= 0) {
    pendingSqueeze = null;
  }
  if (e.touches.length < 2) gesture = null;
}

setInterval(() => {
  if (!pendingSqueeze || active || !focus) return;
  const now = performance.now();
  if (now - pendingSqueeze.start < 380) return;
  // If the two fingers were not moving as pinch/pan, treat the hold as the beginning of a squeeze.
  const fakeTouches = Array.from(document.activeElement ? [] : []);
}, 200);

// Touch events do not expose current touches outside the event, so we keep a copy for delayed squeeze detection.
let lastTouches = null;
function rememberTouches(e) {
  lastTouches = Array.from(e.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }));
}
gameArea.addEventListener('touchstart', e => { rememberTouches(e); handleTouchStart(e); }, { passive: false });
gameArea.addEventListener('touchmove', e => {
  rememberTouches(e);
  handleTouchMove(e);
  if (pendingSqueeze && !active && focus && e.touches.length >= 2) {
    const p1 = svgPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
    const p2 = svgPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
    const stillDist = Math.abs(distance(p1,p2) - pendingSqueeze.startDist) < 8;
    const stillMid = distance(midpoint(p1,p2), pendingSqueeze.startMid) < 10;
    if (stillDist && stillMid && performance.now() - pendingSqueeze.start > 420) startSqueezeFromTouches(e.touches);
  }
}, { passive: false });
gameArea.addEventListener('touchend', e => { rememberTouches(e); handleTouchEnd(e); }, { passive: false });
gameArea.addEventListener('touchcancel', e => { rememberTouches(e); handleTouchEnd(e); }, { passive: false });

// Desktop: wheel = zoom, drag empty area = pan, click/hold focused pimple = squeeze.
function startPointerSqueeze(e) {
  if (e.pointerType === 'touch') return;
  ensureAudio();
  const fp = facePointFromClient(e.clientX, e.clientY);
  const hit = pimpleAtFacePoint(fp);
  if (hit && (!focus || focus.id !== hit.id)) { selectPimple(e, hit.id); return; }
  if (focus && distance(fp, focus) < focus.r * 4.5) {
    e.preventDefault();
    active = focus;
    pointerMode = true;
    currentPointer = fp;
    startTime = performance.now();
    feedback.innerHTML = `Desktop squeeze started. Hold for <b>about 3 seconds</b>, then release.`;
    loop();
  } else {
    mouseDrag = { x: e.clientX, y: e.clientY, tx: cam.tx, ty: cam.ty };
    gameArea.setPointerCapture?.(e.pointerId);
  }
}
function updatePointer(e) {
  if (e.pointerType === 'touch') return;
  if (active && pointerMode) {
    currentPointer = facePointFromClient(e.clientX, e.clientY);
    return;
  }
  if (mouseDrag) {
    const dx = (e.clientX - mouseDrag.x) / (svg.getBoundingClientRect().width / 560);
    const dy = (e.clientY - mouseDrag.y) / (svg.getBoundingClientRect().height / 720);
    cam.tx = mouseDrag.tx + dx;
    cam.ty = mouseDrag.ty + dy;
    applyCam();
  }
}
function endPointer(e) {
  if (e.pointerType === 'touch') return;
  if (active) endSqueeze(e);
  mouseDrag = null;
}
gameArea.addEventListener('pointerdown', startPointerSqueeze);
gameArea.addEventListener('pointermove', updatePointer);
gameArea.addEventListener('pointerup', endPointer);
gameArea.addEventListener('pointercancel', endPointer);
gameArea.addEventListener('wheel', e => {
  e.preventDefault();
  const p = svgPointFromClient(e.clientX, e.clientY);
  zoomAt(p, e.deltaY < 0 ? 1.16 : 0.86);
}, { passive: false });

function virtualMouseTouches(p, elapsed) {
  const progress = clamp(elapsed / p.target, 0, 1.25);
  const wobble = Math.sin(elapsed * 7) * p.r * 0.06;
  const gap = clamp(p.r * (7.8 - progress * 5.0), p.r * 2.25, p.r * 8.2);
  return [
    { x: p.x - gap / 2 + wobble, y: p.y },
    { x: p.x + gap / 2 - wobble, y: p.y }
  ];
}
function metricsForTouches(p, a, b, elapsed) {
  const mid = midpoint(a, b);
  const centerError = distance(mid, p);
  const positionScore = clamp(1 - centerError / (p.r * 4.6), 0, 1);
  const gap = distance(a, b);
  const idealGap = p.r * 2.7;
  const pressureScore = clamp(1 - Math.abs(gap - idealGap) / (p.r * 4.5), 0, 1);
  const timingScore = clamp(1 - Math.abs(elapsed - p.target) / 1.35, 0, 1);
  return { pos: positionScore, pressure: pressureScore, timing: timingScore, gap };
}
function showFingers(a, b, p) {
  const pa = screenPointFromFace(a.x, a.y);
  const pb = screenPointFromFace(b.x, b.y);
  fingerA.style.opacity = 1;
  fingerB.style.opacity = 1;
  fingerA.style.left = `${pa.x}px`; fingerA.style.top = `${pa.y}px`;
  fingerB.style.left = `${pb.x}px`; fingerB.style.top = `${pb.y}px`;
  fingerA.style.transform = 'translate(-50%, -50%) rotate(-28deg)';
  fingerB.style.transform = 'translate(-50%, -50%) rotate(28deg)';
  const center = screenPointFromFace(p.x, p.y);
  pusStream.style.left = `${center.x}px`;
  pusStream.style.top = `${center.y}px`;
}
function hideFingers() { fingerA.style.opacity = 0; fingerB.style.opacity = 0; }

function loop() {
  if (!active) return;
  const elapsed = (performance.now() - startTime) / 1000;
  let a, b;
  if (pointerMode) [a, b] = virtualMouseTouches(active, elapsed);
  else [a, b] = touchPair;
  if (!a || !b) { endSqueeze(); return; }
  const m = metricsForTouches(active, a, b, elapsed);
  showFingers(a, b, active);
  timerText.textContent = elapsed.toFixed(1);
  setBars(clamp(elapsed / active.target, 0, 1), m.pos, m.pressure);
  if (elapsed > 0.35 && elapsed < active.target + 0.35 && m.pos > 0.30 && m.pressure > 0.18) sprayPus(active, false);
  if (elapsed > active.target + 1.15) { endSqueeze(); return; }
  rafId = requestAnimationFrame(loop);
}
function endSqueeze(e) {
  if (e?.preventDefault) e.preventDefault();
  if (!active) return;
  cancelAnimationFrame(rafId);
  const p = active;
  const elapsed = (performance.now() - startTime) / 1000;
  let a, b;
  if (pointerMode) [a, b] = virtualMouseTouches(p, elapsed);
  else [a, b] = touchPair || [{ x: p.x - p.r * 2, y: p.y }, { x: p.x + p.r * 2, y: p.y }];
  const m = metricsForTouches(p, a, b, elapsed);
  const tooEarly = elapsed < 2.25;
  const tooLate = elapsed > 3.65;
  const skill = m.pos * 0.34 + m.pressure * 0.33 + m.timing * 0.33;
  let gained = Math.round(1000 * skill * combo);
  const el = getPimpleElement(p.id);
  hideFingers();
  setBars(m.timing, m.pos, m.pressure);
  timerText.textContent = elapsed.toFixed(1);
  if (tooLate) {
    gained = -Math.round(250 + p.r * 10);
    score = Math.max(0, score + gained);
    combo = 1;
    p.state = 'wounded';
    el.classList.remove('unpopped', 'focused');
    el.classList.add('wounded');
    mouth.setAttribute('d', 'M220 535 Q280 490 340 535');
    redFlash.classList.remove('flash'); void redFlash.offsetWidth; redFlash.classList.add('flash');
    playTone('hurt');
    showFloat('OUCH! Too long', false);
    feedback.innerHTML = `❌ Too long: red wound and unhappy face.<br><br><b>Time:</b> ${elapsed.toFixed(1)} sec<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> ${gained}`;
  } else if (tooEarly) {
    gained = Math.round(gained * 0.25);
    score += gained;
    combo = 1;
    playTone('fail');
    showFloat('Still inside', false);
    feedback.innerHTML = `⚠️ Too short: pus is still inside. Hold closer to <b>3 seconds</b> next time.<br><br><b>Time:</b> ${elapsed.toFixed(1)} sec<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> +${gained}`;
  } else if (skill < 0.52) {
    gained = Math.round(gained * 0.35);
    score += gained;
    combo = 1;
    playTone('fail');
    showFloat('Bad squeeze', false);
    feedback.innerHTML = `⚠️ Timing was okay, but finger position/pressure was weak.<br><br><b>Time:</b> ${elapsed.toFixed(1)} sec<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> +${gained}`;
  } else {
    score += gained;
    combo = clamp(combo + 1, 1, 5);
    p.state = 'popped';
    el.classList.remove('unpopped', 'focused');
    el.classList.add('popped');
    mouth.setAttribute('d', 'M220 500 Q280 545 340 500');
    sprayPus(p, true);
    burst(p);
    playTone('pop');
    showFloat(`POP! +${gained}`, true);
    feedback.innerHTML = `✅ Clean 3-second pop! Pus flows out, then it pops with sound.<br><br><b>Time:</b> ${elapsed.toFixed(1)} sec<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> +${gained}`;
    setTimeout(() => { if (focus && focus.id === p.id && p.state === 'popped') clearZoom(); }, 950);
  }
  active = null;
  touchPair = null;
  pendingSqueeze = null;
  gesture = null;
  updateStats();
  checkWin();
}

function sprayPus(p, finalPop) {
  const center = screenPointFromFace(p.x, p.y);
  pusStream.style.left = `${center.x}px`;
  pusStream.style.top = `${center.y}px`;
  pusStream.style.display = 'block';
  const count = finalPop ? 22 : 2;
  for (let i = 0; i < count; i++) {
    const drop = document.createElement('span');
    drop.className = finalPop && i % 3 === 0 ? 'pus-line' : 'pus-drop';
    const angle = (-110 + Math.random() * 80) * Math.PI / 180;
    const power = finalPop ? 90 + Math.random() * 135 : 30 + Math.random() * 44;
    drop.style.setProperty('--dx', `${Math.cos(angle) * power}px`);
    drop.style.setProperty('--dy', `${Math.sin(angle) * power}px`);
    drop.style.setProperty('--rot', `${-45 + Math.random() * 90}deg`);
    drop.style.animationDelay = `${Math.random() * (finalPop ? 180 : 60)}ms`;
    pusStream.appendChild(drop);
    setTimeout(() => drop.remove(), 1100);
  }
  setTimeout(() => { if (!pusStream.children.length) pusStream.style.display = 'none'; }, 1150);
}
function burst(p) {
  const center = screenPointFromFace(p.x, p.y);
  popBurst.style.left = `${center.x}px`;
  popBurst.style.top = `${center.y}px`;
  popBurst.innerHTML = '';
  popBurst.style.display = 'block';
  for (let i = 0; i < 12; i++) {
    const ray = document.createElement('span');
    ray.style.setProperty('--rot', `${i * 30}deg`);
    popBurst.appendChild(ray);
  }
  setTimeout(() => { popBurst.style.display = 'none'; popBurst.innerHTML = ''; }, 620);
}
function showFloat(text, good) {
  floatingText.textContent = text;
  floatingText.style.color = good ? '#69ff9d' : '#ff637a';
  floatingText.classList.remove('float'); void floatingText.offsetWidth; floatingText.classList.add('float');
}
function checkWin() {
  const left = pimples.filter(p => p.state === 'unpopped').length;
  if (left === 0) {
    const wounded = pimples.filter(p => p.state === 'wounded').length;
    const message = wounded === 0 ? 'Perfect skin run!' : `${wounded} wound(s), but the face is cleared.`;
    feedback.innerHTML += `<br><br>🏁 <b>Game finished.</b> ${message} Final score: <b>${score}</b>.`;
  }
}
function restart() {
  score = 0; combo = 1; active = null; touchPair = null; focus = null; pendingSqueeze = null; gesture = null; mouseDrag = null;
  cancelAnimationFrame(rafId);
  mouth.setAttribute('d', 'M220 500 Q280 545 340 500');
  resetCam();
  targetRing.classList.remove('show');
  backBtn.classList.remove('show');
  modeHint.textContent = 'Tap pimple • pinch to zoom • hold two fingers to pop';
  buildPimples();
  setBars(0,0,0);
  timerText.textContent = '0.0';
  updateStats();
  hideFingers();
  feedback.innerHTML = 'Tap a pimple first. Then pinch zoom in/out with two fingers until it is big enough.';
}

restartBtn.addEventListener('click', restart);
backBtn.addEventListener('click', clearZoom);
window.addEventListener('resize', positionZoomUI);
restart();
