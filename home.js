// ===================== BERANDA LOGIC =====================

const LEVELS = [
  { id: 1, name: "Bumi",      desc: "Alien mendarat di Bumi! Jadilah pahlawan pertama yang mengusir mereka." },
  { id: 2, name: "Verdania",  desc: "Planet hutan penuh alien bersembunyi di balik pepohonan raksasa." },
  { id: 3, name: "Solandra",  desc: "Planet yang sangat panas, alien di sini bergerak lebih cepat!" },
  { id: 4, name: "Jovaris",   desc: "Badai gas beracun menyelimuti planet, tetap waspada!" },
  { id: 5, name: "Titanor",   desc: "Markas besar pasukan alien. Pertahanan mereka sangat kuat." },
  { id: 6, name: "Marsoid",   desc: "Pertarungan pamungkas! Kalahkan alien terkuat demi galaksi." },
];

const store = {
  get unlocked() { return parseInt(localStorage.getItem('pag_unlocked') || '1', 10); },
  set unlocked(v) { localStorage.setItem('pag_unlocked', String(v)); },
  get diff() { return localStorage.getItem('pag_diff') || 'medium'; },
  set diff(v) { localStorage.setItem('pag_diff', v); },
  get stars() {
    try { return JSON.parse(localStorage.getItem('pag_stars') || '{}'); }
    catch(e) { return {}; }
  }
};

// ---------- Difficulty selector ----------
const diffRow = document.getElementById('diffRow');
function refreshDiffUI() {
  [...diffRow.children].forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.diff === store.diff);
  });
}
diffRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.diff-btn');
  if (!btn) return;
  store.diff = btn.dataset.diff;
  refreshDiffUI();
});
refreshDiffUI();

// ---------- Star path map ----------
const starPath = document.getElementById('starPath');
const unlocked = store.unlocked;
const starsData = store.stars;

function starString(n) {
  n = n || 0;
  return '⭐'.repeat(n) + '☆'.repeat(3 - n);
}

LEVELS.forEach(lv => {
  const isUnlocked = lv.id <= unlocked;
  const isCurrent = lv.id === unlocked;
  const node = document.createElement('div');
  node.className = 'star-node ' + (isUnlocked ? 'unlocked' : 'locked') + (isCurrent ? ' current' : '');
  node.dataset.level = lv.id;
  node.innerHTML = `
    <div class="node-planet-wrap">
      <img class="node-planet" src="assets/planet${lv.id}.png" alt="Planet ${lv.name}">
      <div class="node-lock">🔒</div>
      <div class="node-stars">${starString(starsData[lv.id])}</div>
    </div>
    <img class="node-label" src="assets/ButtonLevel${lv.id}.png" alt="Level ${lv.id}">
  `;
  starPath.appendChild(node);
});

// ---------- Mission modal ----------
const modal = document.getElementById('missionModal');
const modalPlanet = document.getElementById('modalPlanet');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalStars = document.getElementById('modalStars');
const modalGo = document.getElementById('modalGo');
const modalCancel = document.getElementById('modalCancel');

let pendingLevel = null;

starPath.addEventListener('click', (e) => {
  const node = e.target.closest('.star-node');
  if (!node) return;
  const id = parseInt(node.dataset.level, 10);
  if (node.classList.contains('locked')) {
    node.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }
    ], { duration: 260 });
    return;
  }
  openMission(id);
});

function openMission(id) {
  pendingLevel = id;
  const lv = LEVELS.find(l => l.id === id);
  modalPlanet.src = `assets/planet${id}.png`;
  modalTitle.textContent = `MISI ${id}: ${lv.name.toUpperCase()}`;
  modalDesc.textContent = lv.desc;
  modalStars.textContent = starString(starsData[id]);
  modal.classList.add('show');
}
function closeMission() { modal.classList.remove('show'); pendingLevel = null; }

modalCancel.addEventListener('click', closeMission);
modal.addEventListener('click', (e) => { if (e.target === modal) closeMission(); });
modalGo.addEventListener('click', () => {
  if (!pendingLevel) return;
  window.location.href = `game.html?level=${pendingLevel}&diff=${store.diff}`;
});
