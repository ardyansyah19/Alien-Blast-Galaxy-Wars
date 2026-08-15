// ===================== PERANG ANTAR GALAKSI — GAME ENGINE =====================
(function () {
  "use strict";

  // ---------- Level metadata ----------
  const LEVELS = [
    { id: 1, name: "Bumi",     desc: "Alien mendarat di Bumi! Jadilah pahlawan pertama." },
    { id: 2, name: "Verdania", desc: "Planet hutan penuh alien bersembunyi di balik pepohonan raksasa." },
    { id: 3, name: "Solandra", desc: "Planet yang sangat panas, alien di sini bergerak lebih cepat!" },
    { id: 4, name: "Jovaris",  desc: "Badai gas beracun menyelimuti planet, tetap waspada!" },
    { id: 5, name: "Titanor",  desc: "Markas besar pasukan alien. Pertahanan mereka sangat kuat." },
    { id: 6, name: "Marsoid",  desc: "Pertarungan pamungkas! Kalahkan alien terkuat demi galaksi." },
  ];

  // ---------- URL params ----------
  const params = new URLSearchParams(window.location.search);
  let level = Math.min(6, Math.max(1, parseInt(params.get('level') || '1', 10)));
  let diff = params.get('diff') || localStorage.getItem('pag_diff') || 'medium';
  if (!['easy', 'medium', 'hard'].includes(diff)) diff = 'medium';

  const lvMeta = LEVELS[level - 1];

  // ---------- Difficulty & level config ----------
  function buildConfig(level, diff) {
    const diffMult = {
      easy:   { speed: 0.78, spawn: 1.30, hp: 0.8,  lives: 4, shot: 0.5 },
      medium: { speed: 1.0,  spawn: 1.0,  hp: 1.0,  lives: 3, shot: 1.0 },
      hard:   { speed: 1.28, spawn: 0.75, hp: 1.25, lives: 3, shot: 1.6 },
    }[diff];

    const killTarget = Math.round((10 + (level - 1) * 4) * (0.9 + (level - 1) * 0.02));
    const alienSpeed = (60 + (level - 1) * 12) * diffMult.speed;
    const spawnInterval = Math.max(0.55, (1.5 - (level - 1) * 0.12) * diffMult.spawn);
    const alienHP = Math.max(1, Math.round((1 + Math.floor((level - 1) / 2)) * diffMult.hp));
    const maxLives = diffMult.lives;
    const fireRate = Math.max(0.16, 0.34 - level * 0.012);
    const shotChancePerSec = level >= 3 ? (0.15 + (level - 3) * 0.07) * diffMult.shot : 0;
    const scrollSpeed = 50 + (level - 1) * 7;

    return { killTarget, alienSpeed, spawnInterval, alienHP, maxLives, fireRate, shotChancePerSec, scrollSpeed };
  }

  const CFG = buildConfig(level, diff);

  // ---------- DOM refs ----------
  const wrap = document.getElementById('gameWrap');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const hudLevel = document.getElementById('hudLevel');
  const hudLives = document.getElementById('hudLives');
  const hudScore = document.getElementById('hudScore');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');

  const readyOverlay = document.getElementById('readyOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const winOverlay = document.getElementById('winOverlay');
  const loseOverlay = document.getElementById('loseOverlay');

  hudLevel.textContent = `MISI ${level}`;
  document.getElementById('readyPlanet').src = `assets/planet${level}.png`;
  document.getElementById('readyTitle').textContent = `MISI ${level}: ${lvMeta.name.toUpperCase()}`;
  document.getElementById('readyDesc').textContent = lvMeta.desc;

  // ---------- Asset loading ----------
  const IMG = {};
  const toLoad = {
    bg: 'assets/BGperang.png',
    planet: `assets/planet${level}.png`,
    alien: 'assets/alien.png',
    plane: `assets/plane${level}.png`,
    missile: 'assets/missile.png',
  };
  let loadedCount = 0;
  const totalToLoad = Object.keys(toLoad).length;
  Object.entries(toLoad).forEach(([key, src]) => {
    const im = new Image();
    im.onload = () => { loadedCount++; };
    im.src = src;
    IMG[key] = im;
  });

  // ---------- Canvas sizing ----------
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  function resize() {
    const rect = wrap.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', () => { resize(); initStars(); });
  resize();

  // ---------- Game state ----------
  const state = {
    phase: 'ready', // ready | playing | paused | win | lose
    lives: CFG.maxLives,
    kills: 0,
    score: 0,
    t: 0,
  };

  const plane = { x: 0, y: 0, w: 0, h: 0, tx: 0, ty: 0, vx: 0 };
  let missiles = [];
  let aliens = [];
  let alienShots = [];
  let particles = [];

  let fireTimer = 0;
  let spawnTimer = 0.6;
  let planetBob = 0;
  let shakeUntil = 0;

  function planeAspect() {
    return IMG.plane.naturalWidth ? (IMG.plane.naturalHeight / IMG.plane.naturalWidth) : 0.87;
  }

  function resetEntities() {
    plane.w = Math.min(W * 0.24, 110);
    plane.h = plane.w * planeAspect();
    plane.x = W / 2; plane.tx = W / 2;
    plane.y = H * 0.8; plane.ty = H * 0.8;
    missiles = []; aliens = []; alienShots = []; particles = [];
    fireTimer = 0; spawnTimer = 0.4;
    state.lives = CFG.maxLives;
    state.kills = 0;
    state.score = 0;
    updateHUD();
  }
  resetEntities();

  // background star particles (gives sense of flying without tiling the art)
  let bgStars = [];
  function initStars() {
    const n = Math.round((W * H) / 9000);
    bgStars = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 1.8 + 0.6,
      speed: (30 + Math.random() * 50) * (CFG.scrollSpeed / 55),
      a: 0.4 + Math.random() * 0.6,
    }));
  }
  initStars();

  // ---------- Input (drag to move plane) ----------
  let dragging = false;
  function pointerToLocal(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  function onPointerDown(e) {
    dragging = true;
    const p = pointerToLocal(e);
    plane.tx = p.x; plane.ty = p.y;
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const p = pointerToLocal(e);
    plane.tx = p.x; plane.ty = p.y;
    e.preventDefault();
  }
  function onPointerUp(e) { dragging = false; }

  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  canvas.addEventListener('touchmove', onPointerMove, { passive: false });
  canvas.addEventListener('touchend', onPointerUp);
  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  // ---------- Spawning ----------
  function spawnAlien() {
    const size = Math.min(W * 0.17, 78);
    aliens.push({
      x: size / 2 + Math.random() * (W - size),
      y: -size,
      baseX: 0,
      w: size, h: size * (IMG.alien.naturalHeight / IMG.alien.naturalWidth || 1.15),
      speed: CFG.alienSpeed * (0.85 + Math.random() * 0.3),
      hp: CFG.alienHP,
      maxHp: CFG.alienHP,
      phase: Math.random() * Math.PI * 2,
      freq: 1.2 + Math.random() * 0.8,
      amp: 22 + Math.random() * 26,
      flash: 0,
      shotTimer: 0.5 + Math.random() * 1.2,
    });
    aliens[aliens.length - 1].baseX = aliens[aliens.length - 1].x;
  }

  function fireMissile() {
    const size = Math.min(W * 0.055, 26);
    // muzzle point = nose / propeller of the plane (top-center)
    const nx = plane.x;
    const ny = plane.y - plane.h * 0.46;
    missiles.push({ x: nx, y: ny, w: size, h: size * (IMG.missile.naturalHeight / IMG.missile.naturalWidth || 1), speed: 520 });
    // muzzle spark particles
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: nx + (Math.random() - 0.5) * 6, y: ny, vx: (Math.random() - 0.5) * 40, vy: -80 - Math.random() * 40,
        life: 0.25, maxLife: 0.25, color: '#FFD400', size: 3 + Math.random() * 2,
      });
    }
  }

  function spawnExplosion(x, y, big) {
    const n = big ? 18 : 10;
    const colors = ['#FFD400', '#FF9500', '#FF3B30'];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 140;
      particles.push({
        x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 0.4 + Math.random() * 0.3, maxLife: 0.7,
        color: colors[i % colors.length], size: (big ? 4 : 3) + Math.random() * 3,
      });
    }
  }

  function triggerShake(ms) { shakeUntil = performance.now() + ms; }

  // ---------- HUD ----------
  function updateHUD() {
    hudLives.textContent = '❤️'.repeat(Math.max(0, state.lives)) + '🖤'.repeat(Math.max(0, CFG.maxLives - state.lives));
    hudScore.textContent = `⭐ ${state.score}`;
    const pct = Math.min(100, (state.kills / CFG.killTarget) * 100);
    progressFill.style.width = pct + '%';
    progressLabel.textContent = `${Math.min(state.kills, CFG.killTarget)} / ${CFG.killTarget}`;
  }

  // ---------- Update ----------
  function update(dt) {
    state.t += dt;

    // keep plane size correct once the image has finished loading
    plane.h = plane.w * planeAspect();

    // drifting stars for a sense of motion
    bgStars.forEach(s => {
      s.y += s.speed * dt;
      if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
    });

    // plane follows finger with smoothing
    const follow = 1 - Math.pow(0.001, dt);
    plane.x += (plane.tx - plane.x) * follow;
    plane.y += (plane.ty - plane.y) * follow;
    plane.x = Math.max(plane.w * 0.5, Math.min(W - plane.w * 0.5, plane.x));
    plane.y = Math.max(H * 0.4, Math.min(H - plane.h * 0.55, plane.y));
    plane.vx = (plane.tx - plane.x);

    // engine trail
    if (Math.random() < 0.6) {
      particles.push({
        x: plane.x + (Math.random() - 0.5) * plane.w * 0.3,
        y: plane.y + plane.h * 0.4,
        vx: (Math.random() - 0.5) * 15, vy: 60 + Math.random() * 30,
        life: 0.3, maxLife: 0.3, color: '#29ABE2', size: 2 + Math.random() * 2,
      });
    }

    // firing
    fireTimer -= dt;
    if (fireTimer <= 0) { fireMissile(); fireTimer = CFG.fireRate; }

    // spawning
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnAlien(); spawnTimer = CFG.spawnInterval * (0.8 + Math.random() * 0.4); }

    // missiles
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.y -= m.speed * dt;
      if (m.y < -40) missiles.splice(i, 1);
    }

    // aliens
    for (let i = aliens.length - 1; i >= 0; i--) {
      const a = aliens[i];
      a.y += a.speed * dt;
      a.x = a.baseX + Math.sin(state.t * a.freq + a.phase) * a.amp;
      a.x = Math.max(a.w / 2, Math.min(W - a.w / 2, a.x));
      if (a.flash > 0) a.flash -= dt;

      // alien shooting
      if (CFG.shotChancePerSec > 0) {
        a.shotTimer -= dt;
        if (a.shotTimer <= 0) {
          alienShots.push({ x: a.x, y: a.y + a.h * 0.3, speed: 160 + level * 8 });
          a.shotTimer = 1 / CFG.shotChancePerSec * (0.6 + Math.random() * 0.8);
        }
      }

      // reached bottom -> invade, lose a life
      if (a.y - a.h / 2 > H) {
        aliens.splice(i, 1);
        loseLife();
        continue;
      }

      // collide with plane
      if (dist(a.x, a.y, plane.x, plane.y) < (a.w * 0.32 + plane.w * 0.28)) {
        aliens.splice(i, 1);
        spawnExplosion(a.x, a.y, true);
        triggerShake(260);
        loseLife();
        continue;
      }
    }

    // alien shots
    for (let i = alienShots.length - 1; i >= 0; i--) {
      const s = alienShots[i];
      s.y += s.speed * dt;
      if (s.y > H + 30) { alienShots.splice(i, 1); continue; }
      if (dist(s.x, s.y, plane.x, plane.y) < (14 + plane.w * 0.25)) {
        alienShots.splice(i, 1);
        spawnExplosion(plane.x, plane.y, false);
        triggerShake(180);
        loseLife();
      }
    }

    // missile vs alien / alienShot collisions
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      let hit = false;

      for (let j = aliens.length - 1; j >= 0; j--) {
        const a = aliens[j];
        if (dist(m.x, m.y, a.x, a.y) < (a.w * 0.3 + m.w * 0.4)) {
          a.hp -= 1; a.flash = 0.12;
          hit = true;
          if (a.hp <= 0) {
            spawnExplosion(a.x, a.y, true);
            aliens.splice(j, 1);
            state.kills++; state.score += 10;
            updateHUD();
          } else {
            spawnExplosion(m.x, m.y, false);
          }
          break;
        }
      }
      if (!hit) {
        for (let k = alienShots.length - 1; k >= 0; k--) {
          const s = alienShots[k];
          if (dist(m.x, m.y, s.x, s.y) < 18) {
            alienShots.splice(k, 1);
            spawnExplosion(s.x, s.y, false);
            hit = true;
            break;
          }
        }
      }
      if (hit) missiles.splice(i, 1);
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
    }

    planetBob = Math.sin(state.t * 0.5) * 8;

    // win check
    if (state.kills >= CFG.killTarget) {
      winGame();
    }
  }

  function dist(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }

  function loseLife() {
    state.lives -= 1;
    updateHUD();
    if (state.lives <= 0) loseGame();
  }

  // ---------- Draw ----------
  function drawBackground() {
    if (!IMG.bg.complete || !IMG.bg.naturalWidth) { ctx.fillStyle = '#05040D'; ctx.fillRect(0, 0, W, H); return; }
    // cover-fit, anchored so the artwork's composition (sun glow corner) stays intact
    const iw = IMG.bg.naturalWidth, ih = IMG.bg.naturalHeight;
    const scale = Math.max(W / iw, H / ih) * 1.03; // slight overscan for the drift below
    const dw = iw * scale, dh = ih * scale;
    const driftX = Math.sin(state.t * 0.05) * 6;
    const driftY = Math.cos(state.t * 0.04) * 6;
    const dx = (W - dw) / 2 + driftX;
    const dy = (H - dh) / 2 + driftY;
    ctx.drawImage(IMG.bg, dx, dy, dw, dh);
  }

  function drawStars() {
    bgStars.forEach(s => {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawPlanet() {
    if (!IMG.planet.complete || !IMG.planet.naturalWidth) return;
    const size = Math.min(W * 0.6, 300);
    const cx = W * 0.5, cy = H * 0.22 + planetBob;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(cx, cy);
    ctx.rotate(state.t * 0.06);
    ctx.drawImage(IMG.planet, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawPlane() {
    if (!IMG.plane.complete || !IMG.plane.naturalWidth) return;
    const tilt = Math.max(-0.3, Math.min(0.3, plane.vx * 0.006));
    ctx.save();
    ctx.translate(plane.x, plane.y);
    ctx.rotate(tilt);
    ctx.drawImage(IMG.plane, -plane.w / 2, -plane.h / 2, plane.w, plane.h);
    ctx.restore();
  }

  function drawAliens() {
    if (!IMG.alien.complete || !IMG.alien.naturalWidth) return;
    aliens.forEach(a => {
      ctx.save();
      ctx.translate(a.x, a.y);
      const wob = Math.sin(state.t * a.freq + a.phase) * 0.08;
      ctx.rotate(wob);
      if (a.flash > 0) {
        ctx.filter = 'brightness(2.4)';
      }
      ctx.drawImage(IMG.alien, -a.w / 2, -a.h / 2, a.w, a.h);
      ctx.filter = 'none';
      ctx.restore();
      // hp pips for tougher aliens
      if (a.maxHp > 1) {
        const pipW = 6, gap = 3;
        const totalW = a.maxHp * pipW + (a.maxHp - 1) * gap;
        let px = a.x - totalW / 2;
        const py = a.y - a.h / 2 - 10;
        for (let i = 0; i < a.maxHp; i++) {
          ctx.fillStyle = i < a.hp ? '#3ED07A' : 'rgba(255,255,255,.25)';
          ctx.fillRect(px, py, pipW, 4);
          px += pipW + gap;
        }
      }
    });
  }

  function drawMissiles() {
    if (!IMG.missile.complete || !IMG.missile.naturalWidth) return;
    missiles.forEach(m => {
      ctx.drawImage(IMG.missile, m.x - m.w / 2, m.y - m.h / 2, m.w, m.h);
    });
  }

  function drawAlienShots() {
    alienShots.forEach(s => {
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 10);
      grad.addColorStop(0, '#FFEFA8');
      grad.addColorStop(0.5, '#FF3B30');
      grad.addColorStop(1, 'rgba(255,59,48,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawStars();
    drawPlanet();
    drawAlienShots();
    drawAliens();
    drawMissiles();
    drawPlane();
    drawParticles();
  }

  // ---------- Win / Lose ----------
  function computeStars() {
    const ratio = state.lives / CFG.maxLives;
    if (state.lives >= CFG.maxLives) return 3;
    if (ratio >= 0.5) return 2;
    return 1;
  }

  function saveProgress(stars) {
    const unlocked = parseInt(localStorage.getItem('pag_unlocked') || '1', 10);
    if (level + 1 > unlocked) localStorage.setItem('pag_unlocked', String(Math.min(6, level + 1)));
    let starsObj = {};
    try { starsObj = JSON.parse(localStorage.getItem('pag_stars') || '{}'); } catch (e) {}
    starsObj[level] = Math.max(starsObj[level] || 0, stars);
    localStorage.setItem('pag_stars', JSON.stringify(starsObj));
  }

  function winGame() {
    if (state.phase !== 'playing') return;
    state.phase = 'win';
    const stars = computeStars();
    saveProgress(stars);
    document.getElementById('winStars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    const winDesc = document.getElementById('winDesc');
    const btnNext = document.getElementById('btnNext');
    if (level >= 6) {
      winDesc.textContent = 'Luar biasa! Kamu berhasil menyelamatkan seluruh galaksi dari alien!';
      btnNext.style.display = 'none';
    } else {
      winDesc.textContent = `Planet ${lvMeta.name} berhasil diselamatkan!`;
      btnNext.style.display = '';
    }
    winOverlay.classList.remove('hidden');
  }

  function loseGame() {
    if (state.phase !== 'playing') return;
    state.phase = 'lose';
    loseOverlay.classList.remove('hidden');
  }

  // ---------- Buttons ----------
  document.getElementById('btnStart').addEventListener('click', () => {
    readyOverlay.classList.add('hidden');
    state.phase = 'playing';
  });
  document.getElementById('btnPause').addEventListener('click', () => {
    if (state.phase !== 'playing') return;
    state.phase = 'paused';
    pauseOverlay.classList.remove('hidden');
  });
  document.getElementById('btnResume').addEventListener('click', () => {
    pauseOverlay.classList.add('hidden');
    state.phase = 'playing';
  });
  document.getElementById('btnPauseMenu').addEventListener('click', () => { window.location.href = 'index.html'; });
  document.getElementById('btnBack').addEventListener('click', () => { window.location.href = 'index.html'; });

  document.getElementById('btnNext').addEventListener('click', () => {
    window.location.href = `game.html?level=${Math.min(6, level + 1)}&diff=${diff}`;
  });
  document.getElementById('btnReplayWin').addEventListener('click', () => location.reload());
  document.getElementById('btnMenuWin').addEventListener('click', () => { window.location.href = 'index.html'; });
  document.getElementById('btnRetry').addEventListener('click', () => location.reload());
  document.getElementById('btnMenuLose').addEventListener('click', () => { window.location.href = 'index.html'; });

  // ---------- Main loop ----------
  let lastTs = 0;
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    dt = Math.min(dt, 0.033);
    lastTs = ts;

    if (state.phase === 'playing') update(dt);
    draw();

    if (performance.now() < shakeUntil) {
      wrap.classList.add('shake');
    } else {
      wrap.classList.remove('shake');
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

})();
