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
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
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

function screenPointFromSvg(x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x; pt.y = y;
  const p = pt.matrixTransform(svg.getScreenCTM());
  const rect = gameArea.getBoundingClientRect();
  return { x: p.x - rect.left, y: p.y - rect.top };
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
      <circle class="hit" cx="${p.x}" cy="${p.y}" r="${p.r + 26}" fill="transparent"></circle>
    `;
    g.addEventListener('pointerdown', e => selectPimple(e, p.id));
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

function focusPimple(p) {
  focus = p;
  document.querySelectorAll('.pimple').forEach(el => el.classList.remove('focused'));
  getPimpleElement(p.id)?.classList.add('focused');

  const rect = gameArea.getBoundingClientRect();
  const zoom = rect.width < 530 ? 5.1 : 4.15;
  const viewCenter = { x: 280, y: 360 };
  const dx = (viewCenter.x - p.x) * zoom;
  const dy = (viewCenter.y - p.y) * zoom;
  svg.style.transform = `scale(${zoom}) translate(${dx / zoom}px, ${dy / zoom}px)`;
  svg.classList.add('zoomed');

  targetRing.classList.add('show');
  backBtn.classList.add('show');
  modeHint.textContent = 'Now use two fingers around the enlarged pimple';
  feedback.innerHTML = `Zoomed on a <b>${p.size}</b> pimple. Put two fingers left and right of it and squeeze for <b>about 3 seconds</b>.`;
  setBars(0,0,0);
  timerText.textContent = '0.0';

  setTimeout(positionZoomUI, 680);
}

function positionZoomUI() {
  if (!focus) return;
  const center = screenPointFromSvg(focus.x, focus.y);
  targetRing.style.left = `${center.x}px`;
  targetRing.style.top = `${center.y}px`;
  const ringSize = clamp(Math.max(gameArea.clientWidth, gameArea.clientHeight) * 0.28, 160, 245);
  targetRing.style.width = `${ringSize}px`;
  targetRing.style.height = `${ringSize}px`;
}

function clearZoom() {
  if (active) endSqueeze();
  focus = null;
  svg.style.transform = '';
  svg.classList.remove('zoomed');
  targetRing.classList.remove('show');
  backBtn.classList.remove('show');
  hideFingers();
  document.querySelectorAll('.pimple').forEach(el => el.classList.remove('focused'));
  modeHint.textContent = 'Tap one pimple to zoom in';
  feedback.innerHTML = 'Tap a pimple first. The camera zooms in so the pimple becomes big enough to approach with two fingers.';
  timerText.textContent = '0.0';
  setBars(0,0,0);
}

function startTouchSqueeze(e) {
  if (!focus || active || e.touches.length < 2) return;
  e.preventDefault();
  ensureAudio();
  const a = svgPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
  const b = svgPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (distance(mid, focus) > focus.r * 7.5) {
    showFloat('Closer!', false);
    return;
  }
  active = focus;
  pointerMode = false;
  touchPair = [a, b];
  startTime = performance.now();
  feedback.innerHTML = `Squeezing... keep pressure steady and release around <b>3 seconds</b>.`;
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

function startPointerSqueeze(e) {
  if (!focus || active || e.pointerType === 'touch') return;
  e.preventDefault();
  ensureAudio();
  active = focus;
  pointerMode = true;
  currentPointer = svgPointFromClient(e.clientX, e.clientY);
  startTime = performance.now();
  feedback.innerHTML = `Desktop squeeze started. Hold for <b>about 3 seconds</b>, then release.`;
  loop();
}

function updatePointer(e) {
  if (!active || !pointerMode) return;
  currentPointer = svgPointFromClient(e.clientX, e.clientY);
}

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
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const centerError = distance(mid, p);
  const positionScore = clamp(1 - centerError / (p.r * 4.6), 0, 1);

  const gap = distance(a, b);
  const idealGap = p.r * 2.7;
  const pressureScore = clamp(1 - Math.abs(gap - idealGap) / (p.r * 4.5), 0, 1);

  const timingScore = clamp(1 - Math.abs(elapsed - p.target) / 1.35, 0, 1);
  return { pos: positionScore, pressure: pressureScore, timing: timingScore, gap };
}

function showFingers(a, b, p) {
  const pa = screenPointFromSvg(a.x, a.y);
  const pb = screenPointFromSvg(b.x, b.y);
  fingerA.style.opacity = 1;
  fingerB.style.opacity = 1;
  fingerA.style.left = `${pa.x}px`; fingerA.style.top = `${pa.y}px`;
  fingerB.style.left = `${pb.x}px`; fingerB.style.top = `${pb.y}px`;
  fingerA.style.transform = 'translate(-50%, -50%) rotate(-28deg)';
  fingerB.style.transform = 'translate(-50%, -50%) rotate(28deg)';
  const center = screenPointFromSvg(p.x, p.y);
  pusStream.style.left = `${center.x}px`;
  pusStream.style.top = `${center.y}px`;
}

function hideFingers() {
  fingerA.style.opacity = 0;
  fingerB.style.opacity = 0;
}

function loop() {
  if (!active) return;
  const elapsed = (performance.now() - startTime) / 1000;
  let a, b;
  if (pointerMode) [a, b] = virtualMouseTouches(active, elapsed);
  else [a, b] = touchPair;

  const m = metricsForTouches(active, a, b, elapsed);
  showFingers(a, b, active);
  timerText.textContent = elapsed.toFixed(1);
  setBars(clamp(elapsed / active.target, 0, 1), m.pos, m.pressure);

  if (elapsed > 0.45 && elapsed < active.target + 0.35 && m.pos > 0.35 && m.pressure > 0.22) {
    sprayPus(active, false);
  }

  if (elapsed > active.target + 1.15) {
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
    feedback.innerHTML = `❌ Too long: the wound became red and the face is unhappy.<br><br><b>Time:</b> ${elapsed.toFixed(1)} sec<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> ${gained}`;
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
    feedback.innerHTML = `⚠️ Timing was okay, but the two fingers were not placed/pressed well enough.<br><br><b>Time:</b> ${elapsed.toFixed(1)} sec<br><b>Finger position:</b> ${(m.pos*100).toFixed(0)}%<br><b>Pressure:</b> ${(m.pressure*100).toFixed(0)}%<br><b>Score:</b> +${gained}`;
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
    setTimeout(() => {
      if (focus && focus.id === p.id && p.state === 'popped') clearZoom();
    }, 950);
  }

  active = null;
  touchPair = null;
  updateStats();
  checkWin();
}

function sprayPus(p, finalPop) {
  const center = screenPointFromSvg(p.x, p.y);
  pusStream.style.left = `${center.x}px`;
  pusStream.style.top = `${center.y}px`;
  pusStream.style.display = 'block';

  const count = finalPop ? 18 : 2;
  for (let i = 0; i < count; i++) {
    const drop = document.createElement('span');
    drop.className = finalPop && i % 3 === 0 ? 'pus-line' : 'pus-drop';
    const angle = (-110 + Math.random() * 80) * Math.PI / 180;
    const power = finalPop ? 72 + Math.random() * 112 : 28 + Math.random() * 36;
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
  const center = screenPointFromSvg(p.x, p.y);
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
  score = 0; combo = 1; active = null; touchPair = null; focus = null;
  cancelAnimationFrame(rafId);
  mouth.setAttribute('d', 'M220 500 Q280 545 340 500');
  svg.style.transform = '';
  svg.classList.remove('zoomed');
  targetRing.classList.remove('show');
  backBtn.classList.remove('show');
  modeHint.textContent = 'Tap one pimple to zoom in';
  buildPimples();
  setBars(0,0,0);
  timerText.textContent = '0.0';
  updateStats();
  hideFingers();
  feedback.innerHTML = 'Tap a pimple first. The camera zooms in so the pimple becomes big enough to approach with two fingers.';
}

restartBtn.addEventListener('click', restart);
backBtn.addEventListener('click', clearZoom);
gameArea.addEventListener('touchstart', startTouchSqueeze, { passive: false });
gameArea.addEventListener('touchmove', updateTouchSqueeze, { passive: false });
gameArea.addEventListener('touchend', endSqueeze, { passive: false });
gameArea.addEventListener('touchcancel', endSqueeze, { passive: false });
gameArea.addEventListener('pointerdown', startPointerSqueeze);
gameArea.addEventListener('pointermove', updatePointer);
gameArea.addEventListener('pointerup', endSqueeze);
gameArea.addEventListener('pointercancel', endSqueeze);
window.addEventListener('resize', positionZoomUI);

restart();
