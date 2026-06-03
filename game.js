const pimplesSeed = [
  { id: 1, x: 205, y: 245, size: 'small', r: 10, target: 1.45 },
  { id: 2, x: 337, y: 238, size: 'small', r: 10, target: 1.50 },
  { id: 3, x: 284, y: 292, size: 'small', r: 11, target: 1.55 },
  { id: 4, x: 170, y: 375, size: 'medium', r: 15, target: 2.20 },
  { id: 5, x: 395, y: 372, size: 'medium', r: 15, target: 2.25 },
  { id: 6, x: 265, y: 448, size: 'medium', r: 16, target: 2.35 },
  { id: 7, x: 218, y: 530, size: 'big', r: 21, target: 3.00 },
  { id: 8, x: 350, y: 520, size: 'big', r: 21, target: 3.05 },
  { id: 9, x: 285, y: 610, size: 'big', r: 23, target: 3.25 }
];

const svg = document.getElementById('faceSvg');
const layer = document.getElementById('pimpleLayer');
const gameArea = document.getElementById('gameArea');
const fingerA = document.getElementById('fingerA');
const fingerB = document.getElementById('fingerB');
const pusJet = document.getElementById('pusJet');
const floatingText = document.getElementById('floatingText');
const feedback = document.getElementById('feedback');
const scoreEl = document.getElementById('score');
const leftEl = document.getElementById('leftCount');
const comboEl = document.getElementById('combo');
const timeBar = document.getElementById('timeBar');
const posBar = document.getElementById('posBar');
const pressureBar = document.getElementById('pressureBar');
const redFlash = document.getElementById('redFlash');
const mouth = document.getElementById('mouth');
const restartBtn = document.getElementById('restartBtn');

let pimples = [];
let active = null;
let startTime = 0;
let rafId = null;
let score = 0;
let combo = 1;
let lastMetrics = { pos: 0, pressure: 0, timing: 0 };
let pointerMode = false;
let currentPointer = { x: 0, y: 0 };
let initialMouseDistance = 110;

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function svgPointFromClient(clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}
function screenPointFromSvg(x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x; pt.y = y;
  const p = pt.matrixTransform(svg.getScreenCTM());
  const rect = gameArea.getBoundingClientRect();
  return { x: p.x - rect.left, y: p.y - rect.top };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function buildPimples() {
  layer.innerHTML = '';
  pimples = pimplesSeed.map(p => ({ ...p, state: 'unpopped' }));
  for (const p of pimples) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('pimple', 'unpopped');
    g.dataset.id = p.id;
    g.innerHTML = `
      <circle class="core" cx="${p.x}" cy="${p.y}" r="${p.r}"></circle>
      <circle class="shine" cx="${p.x - p.r * 0.32}" cy="${p.y - p.r * 0.38}" r="${Math.max(3, p.r * 0.24)}"></circle>
      <circle cx="${p.x}" cy="${p.y}" r="${p.r + 18}" fill="transparent"></circle>
    `;
    g.addEventListener('pointerdown', e => startMouseSqueeze(e, p.id));
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

function showFingers(a, b, activePimple) {
  const pa = screenPointFromSvg(a.x, a.y);
  const pb = screenPointFromSvg(b.x, b.y);
  fingerA.style.opacity = 1;
  fingerB.style.opacity = 1;
  fingerA.style.left = `${pa.x}px`; fingerA.style.top = `${pa.y}px`;
  fingerB.style.left = `${pb.x}px`; fingerB.style.top = `${pb.y}px`;
  fingerA.style.transform = 'translate(-50%, -50%) rotate(-23deg)';
  fingerB.style.transform = 'translate(-50%, -50%) rotate(23deg)';
  if (activePimple) {
    const center = screenPointFromSvg(activePimple.x, activePimple.y);
    pusJet.style.left = `${center.x}px`;
    pusJet.style.top = `${center.y}px`;
  }
}
function hideFingers() {
  fingerA.style.opacity = 0;
  fingerB.style.opacity = 0;
}

function getPimpleElement(id) { return layer.querySelector(`[data-id="${id}"]`); }

function metricsForTouches(p, touchA, touchB, elapsed) {
  const mid = { x: (touchA.x + touchB.x) / 2, y: (touchA.y + touchB.y) / 2 };
  const centerError = distance(mid, p);
  const positionScore = clamp(1 - centerError / (p.r * 3.5), 0, 1);
  const gap = distance(touchA, touchB);
  const idealGap = p.r * 3.0;
  const pressureScore = clamp(1 - Math.abs(gap - idealGap) / (p.r * 3.5), 0, 1);
  const timingScore = clamp(1 - Math.abs(elapsed - p.target) / (p.target * 0.8), 0, 1);
  return { pos: positionScore, pressure: pressureScore, timing: timingScore, gap };
}

function mouseVirtualTouches(p, pointer, elapsed) {
  const distFromPimple = distance(pointer, p);
  const squeezeProgress = clamp(elapsed / (p.target * 1.2), 0, 1);
  const idealGap = p.r * 3.0;
  const gap = clamp(initialMouseDistance - squeezeProgress * 80 + distFromPimple * 0.18, idealGap * 0.45, idealGap * 2.6);
  return [{ x: p.x - gap / 2, y: p.y }, { x: p.x + gap / 2, y: p.y }];
}

function startMouseSqueeze(e, id) {
  e.preventDefault();
  if (active) return;
  const p = pimples.find(q => q.id === id && q.state === 'unpopped');
  if (!p) return;
  pointerMode = true;
  currentPointer = svgPointFromClient(e.clientX, e.clientY);
  initialMouseDistance = p.r * 5.5;
  active = p;
  startTime = performance.now();
  gameArea.setPointerCapture?.(e.pointerId);
  feedback.innerHTML = `Squeezing ${p.size} pimple... release close to ${p.target.toFixed(1)} seconds.`;
  loop();
}

gameArea.addEventListener('pointermove', e => {
  if (!active || !pointerMode) return;
  currentPointer = svgPointFromClient(e.clientX, e.clientY);
});
gameArea.addEventListener('pointerup', endSqueeze);
gameArea.addEventListener('pointercancel', endSqueeze);
gameArea.addEventListener('touchstart', startTouchSqueeze, { passive: false });
gameArea.addEventListener('touchmove', updateTouchSqueeze, { passive: false });
gameArea.addEventListener('touchend', endSqueeze, { passive: false });
gameArea.addEventListener('touchcancel', endSqueeze, { passive: false });
let touchPair = null;

function findNearestPimple(pt) {
  let best = null, bestDist = Infinity;
  for (const p of pimples.filter(q => q.state === 'unpopped')) {
    const d = distance(pt, p);
    if (d < bestDist) { best = p; bestDist = d; }
  }
  return bestDist < 70 ? best : null;
}
function startTouchSqueeze(e) {
  if (e.touches.length < 2 || active) return;
  e.preventDefault();
  const a = svgPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
  const b = svgPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const p = findNearestPimple(mid);
  if (!p) return;
  active = p;
  pointerMode = false;
  touchPair = [a, b];
  startTime = performance.now();
  feedback.innerHTML = `Two-finger squeeze started on a ${p.size} pimple. Release at the right moment.`;
  loop();
}
function updateTouchSqueeze(e) {
  if (!active || pointerMode || e.touches.length < 2) return;
  e.preventDefault();
  touchPair = [
    svgPointFromClient(e.touches[0].clientX, e.touches[0].clientY),
    svgPointFromClient(e.touches[1].clientX, e.touches[1].clientY)
  ];
}

function loop() {
  if (!active) return;
  const elapsed = (performance.now() - startTime) / 1000;
  let a, b;
  if (pointerMode) [a, b] = mouseVirtualTouches(active, currentPointer, elapsed);
  else [a, b] = touchPair;
  const m = metricsForTouches(active, a, b, elapsed);
  lastMetrics = m;
  showFingers(a, b, active);
  const timeProgress = clamp(elapsed / (active.target * 1.25), 0, 1);
  setBars(timeProgress, m.pos, m.pressure);
  if (elapsed > active.target * 1.45) {
    endSqueeze();
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function endSqueeze(e) {
  if (e?.preventDefault) e.preventDefault();
  if (!active) return;
  cancelAnimationFrame(rafId);
  const p = active;
  const elapsed = (performance.now() - startTime) / 1000;
  let a, b;
  if (pointerMode) [a, b] = mouseVirtualTouches(p, currentPointer, elapsed);
  else [a, b] = touchPair || [{ x: p.x - p.r, y: p.y }, { x: p.x + p.r, y: p.y }];
  const m = metricsForTouches(p, a, b, elapsed);
  lastMetrics = m;
  hideFingers();
  setBars(m.timing, m.pos, m.pressure);

  const tooEarly = elapsed < p.target * 0.72;
  const tooLate = elapsed > p.target * 1.28;
  const skill = (m.pos * 0.34 + m.pressure * 0.33 + m.timing * 0.33);
  let gained = Math.round(1000 * skill * combo);
  const el = getPimpleElement(p.id);

  if (tooLate) {
    gained = -Math.round(220 + p.r * 10);
    score = Math.max(0, score + gained);
    combo = 1;
    p.state = 'wounded';
    el.classList.remove('unpopped'); el.classList.add('wounded');
    mouth.setAttribute('d', 'M220 535 Q280 490 340 535');
    redFlash.classList.remove('flash'); void redFlash.offsetWidth; redFlash.classList.add('flash');
    showFloat('OUCH! Too long', false);
    feedback.innerHTML = `❌ Too long. The wound became red and the face is unhappy.<br><br><b>Timing:</b> ${(m.timing*100).toFixed(0)}%<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> ${gained}`;
  } else if (tooEarly) {
    gained = Math.round(gained * 0.25);
    score += gained;
    combo = 1;
    showFloat('Too early', false);
    feedback.innerHTML = `⚠️ Too short. There is still pus inside; try a longer squeeze next time.<br><br><b>Timing:</b> ${(m.timing*100).toFixed(0)}%<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> +${gained}`;
  } else if (skill < 0.54) {
    gained = Math.round(gained * 0.35);
    score += gained;
    combo = 1;
    showFloat('Bad squeeze', false);
    feedback.innerHTML = `⚠️ Poor technique. You released in time, but finger position or pressure was weak.<br><br><b>Timing:</b> ${(m.timing*100).toFixed(0)}%<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> +${gained}`;
  } else {
    score += gained;
    combo = clamp(combo + 1, 1, 5);
    p.state = 'popped';
    el.classList.remove('unpopped'); el.classList.add('popped', 'good');
    playPus(p);
    mouth.setAttribute('d', 'M220 500 Q280 545 340 500');
    showFloat(`+${gained}`, true);
    feedback.innerHTML = `✅ Clean pop! Pus flies out and the pore is cleared.<br><br><b>Timing:</b> ${(m.timing*100).toFixed(0)}%<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> +${gained}`;
  }

  active = null;
  touchPair = null;
  updateStats();
  checkWin();
}

function playPus(p) {
  const center = screenPointFromSvg(p.x, p.y);
  pusJet.style.left = `${center.x}px`;
  pusJet.style.top = `${center.y}px`;
  [...pusJet.children].forEach((s, i) => {
    s.style.setProperty('--dx', `${30 + i * 18}px`);
    s.style.setProperty('--dy', `${-45 - i * 18}px`);
  });
  pusJet.style.display = 'block';
  setTimeout(() => pusJet.style.display = 'none', 620);
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
  score = 0; combo = 1; active = null; touchPair = null;
  mouth.setAttribute('d', 'M220 500 Q280 545 340 500');
  buildPimples();
  setBars(0,0,0);
  updateStats();
  hideFingers();
  feedback.innerHTML = 'Tap a pimple. Best score: correct finger position + steady pressure + stop at the right time.';
}
restartBtn.addEventListener('click', restart);
restart();
