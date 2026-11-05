// 홍대2026 — 게임 엔진
import {
  WORLD, WIN_RATIO, FACTIONS, FACTION_ORDER, CHARACTERS, STATS, DIFFICULTY, ROADS, ZONE_LABELS,
} from './data.js';
import {
  CELL, GW, GH, walk, walkCells, inRoad, findPath, buildShops, buildStatic,
} from './world.js';
import { drawChar, drawSummon, drawPed } from './sprites.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
}

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const canvas = $('game'), ctx = canvas.getContext('2d');
const mini = $('minimap'), mctx = mini.getContext('2d');
let VW = 0, VH = 0, DPR = 1, zoom = 1;

// ---------------------------------------------------------------------------
// 설정 (localStorage)
// ---------------------------------------------------------------------------
const settings = { faction: 'RED', char: 0, diff: { RED: 'normal', YELLOW: 'normal', BLUE: 'normal' }, global: 'normal', spectate: false };
try {
  const saved = JSON.parse(localStorage.getItem('hongdae2026') || 'null');
  if (saved) Object.assign(settings, saved, { diff: Object.assign(settings.diff, saved.diff || {}) });
} catch (e) { /* 저장소 사용 불가 */ }
const saveSettings = () => { try { localStorage.setItem('hongdae2026', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------
let state = 'menu'; // menu | play | pause | end
let time = 0;
let shops = [], retail = [], foods = [], fighters = [], peds = [], summons = [], moshes = [], walls = [], fx = [];
let player = null;
let staticMap = null, miniStatic = null;
const cam = { x: 0, y: 0 };
const owner = new Int8Array(GW * GH).fill(-1);
const infl = FACTION_ORDER.map(() => new Float32Array(GW * GH));
const score = { shops: { RED: 0, YELLOW: 0, BLUE: 0 }, share: { RED: 0, YELLOW: 0, BLUE: 0 }, peds: { RED: 0, YELLOW: 0, BLUE: 0 } };
let inflTimer = 0, pedTimer = 0, hudTimer = 0;

// ---------------------------------------------------------------------------
// 입력
// ---------------------------------------------------------------------------
const keys = new Set();
const input = { q: { punch: false, kick: false, spec: false }, block: false, joy: { x: 0, y: 0 } };
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (state === 'play') {
    if (e.code === 'KeyJ') input.q.punch = true;
    if (e.code === 'KeyK') input.q.kick = true;
    if (e.code === 'Space') input.q.spec = true;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); input.block = false; });

function bindBtn(id, onDown, onUp) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); onDown(); });
  const up = () => { el.classList.remove('down'); if (onUp) onUp(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
}
bindBtn('b-punch', () => { input.q.punch = true; });
bindBtn('b-kick', () => { input.q.kick = true; });
bindBtn('b-spec', () => { input.q.spec = true; });
bindBtn('b-block', () => { input.block = true; }, () => { input.block = false; });

const joy = $('joy'), knob = $('knob');
let joyId = null;
function joyMove(e) {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2, m = Math.hypot(dx, dy);
  if (m > max) { dx = (dx / m) * max; dy = (dy / m) * max; }
  input.joy.x = dx / max; input.joy.y = dy / max;
  knob.style.transform = `translate(${dx}px,${dy}px)`;
}
joy.addEventListener('pointerdown', (e) => { e.preventDefault(); joyId = e.pointerId; joy.setPointerCapture(joyId); joyMove(e); });
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; input.joy.x = input.joy.y = 0; knob.style.transform = ''; };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

// ---------------------------------------------------------------------------
// 이동 / 충돌
// ---------------------------------------------------------------------------
function roadOK(x, y, r) { return inRoad(x - r, y) && inRoad(x + r, y) && inRoad(x, y - r) && inRoad(x, y + r); }
function segDist(px, py, w) {
  const vx = w.x2 - w.x1, vy = w.y2 - w.y1;
  const t = clamp(((px - w.x1) * vx + (py - w.y1) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - (w.x1 + vx * t), py - (w.y1 + vy * t));
}
function wallOK(e, nx, ny) {
  if (!walls.length) return true;
  const team = e.faction || e.fac;
  for (const w of walls) {
    if (w.owner === team) continue;
    const d1 = segDist(nx, ny, w);
    if (d1 < e.r + 8 && d1 < segDist(e.x, e.y, w)) return false;
  }
  return true;
}
function tryMove(e, nx, ny) {
  if (!roadOK(nx, ny, e.r) || !wallOK(e, nx, ny)) return false;
  e.x = nx; e.y = ny; return true;
}
function moveE(e, dx, dy) {
  if (dx) tryMove(e, e.x + dx, e.y);
  if (dy) tryMove(e, e.x, e.y + dy);
}

// ---------------------------------------------------------------------------
// FX
// ---------------------------------------------------------------------------
function addText(x, y, text, color = '#fff', size = 14) { fx.push({ k: 'text', x, y, text, color, size, t: 0, max: 1.1 }); }
function addRing(x, y, color, r = 60, max = 0.5) { fx.push({ k: 'ring', x, y, color, r, t: 0, max }); }
function addSpark(x, y, color = '#fff') { fx.push({ k: 'spark', x, y, color, t: 0, max: 0.25 }); }

const toastEl = $('toast');
function toast(msg, color = '#fff') {
  toastEl.textContent = msg; toastEl.style.color = color;
  toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
}

// ---------------------------------------------------------------------------
// 전투원
// ---------------------------------------------------------------------------
function spawnPoint(factionId) {
  const b = FACTIONS[factionId].base;
  for (let i = 0; i < 40; i++) {
    const x = b.x + rnd(-60, 60), y = b.y + rnd(-40, 40);
    if (roadOK(x, y, 8)) return { x, y };
  }
  return { x: b.x, y: b.y };
}

function createFighter(factionId, ch, isPlayer) {
  const p = spawnPoint(factionId);
  const F = FACTIONS[factionId];
  return {
    id: ch.id, name: ch.name, faction: factionId, look: ch.look, color: F.color, dark: F.dark, light: F.light,
    x: p.x, y: p.y, r: 7, fx: 1, fy: 0, face: 1, hp: STATS.hp, stam: STATS.stamina,
    dead: false, respawnT: 0, cdAtk: 0, cdSpec: 0, atk: null, blocking: false, lock: null,
    hitFlash: 0, sinceHit: 9, moving: false, animT: rnd(0, 6), isPlayer,
    intent: { mx: 0, my: 0, block: false, punch: false, kick: false, spec: false },
    ai: isPlayer && !settings.spectate ? null : newAI(),
  };
}
function newAI() {
  return { t: rnd(0, 0.5), mode: 'goto', enemy: null, shop: null, goal: null, path: null, pathGoal: null, repT: 0, atkWait: 0, blockT: 0, retreatT: 0, stuckT: 0, lastX: 0, lastY: 0, stuckN: 0 };
}

function nearestEnemy(f, range) {
  let best = null, bd = range;
  for (const e of fighters) {
    if (e.dead || e.faction === f.faction) continue;
    const d = dist(e, f);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function damage(t, dmg, src, mul = 1) {
  if (t.dead) return;
  let d = dmg * mul;
  if (t.blocking && (t.fx * (src.x - t.x) + t.fy * (src.y - t.y)) > 0) {
    d *= STATS.blockMul; addSpark(t.x + t.fx * 10, t.y - 14, '#bfe3ff');
  } else {
    addSpark(t.x, t.y - 14, '#fff');
  }
  t.hp -= d; t.sinceHit = 0; t.hitFlash = 0.15;
  if (t.hp <= 0) killFighter(t, src);
}
function killFighter(t, src) {
  t.dead = true; t.hp = 0; t.respawnT = STATS.respawn; t.blocking = false; t.atk = null; t.lock = null;
  addText(t.x, t.y - 36, 'KO!', '#fff', 18); addRing(t.x, t.y - 10, FACTIONS[t.faction].color, 50, 0.6);
  if (t === player) toast('KO! 본진에서 재정비합니다', '#ff9aa0');
  else if (src === player) toast(`${t.name} 쓰러뜨림!`, FACTIONS[player.faction].light);
}
function respawn(f) {
  const p = spawnPoint(f.faction);
  f.x = p.x; f.y = p.y; f.hp = STATS.hp; f.stam = Math.max(f.stam, 50); f.dead = false; f.sinceHit = 9; f.cdAtk = 0;
  if (f.ai) { f.ai.mode = 'goto'; f.ai.t = 0; f.ai.shop = null; f.ai.retreatT = 0; }
}

function attack(f, type) {
  if (f.cdAtk > 0 || f.lock || f.dead || f.blocking) return;
  const S = STATS[type];
  f.cdAtk = S.cd; f.atk = { type, t: 0.2 };
  const tgt = nearestEnemy(f, S.range + 26);
  if (tgt) {
    const d = dist(tgt, f) || 1;
    f.fx = (tgt.x - f.x) / d; f.fy = (tgt.y - f.y) / d; f.face = f.fx >= 0 ? 1 : -1;
  }
  for (const e of fighters) {
    if (e.dead || e.faction === f.faction) continue;
    const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy);
    if (d > S.range + 8) continue;
    if (d > 14 && (dx * f.fx + dy * f.fy) / d < 0.35) continue;
    damage(e, S.dmg, f);
    moveE(e, f.fx * 9, f.fy * 9);
  }
}

// ---------------------------------------------------------------------------
// 특수 기술
// ---------------------------------------------------------------------------
function failMsg(f, msg) { if (f === player) toast(msg, '#ffd166'); return false; }

function useSpecial(f) {
  if (f.dead || f.lock) return false;
  if (f.cdSpec > 0) return failMsg(f, '재사용 대기 중…');
  if (f.stam < STATS.special.cost) return failMsg(f, '스태미나 부족 — 음식점에서 회복하세요');
  let ok = false;
  if (f.faction === 'RED') ok = castMosh(f);
  else if (f.faction === 'BLUE') ok = castSummon(f);
  else ok = castWall(f);
  if (ok) { f.stam -= STATS.special.cost; f.cdSpec = STATS.special.cd; }
  return ok;
}

// RED — MOSH PIT
function castMosh(f) {
  const tgt = nearestEnemy(f, 480);
  if (!tgt) return failMsg(f, '모쉬핏: 근처에 적이 없습니다');
  const allies = fighters.filter((a) => a !== f && !a.dead && a.faction === 'RED' && !a.lock && dist(a, tgt) < 650);
  const crowd = peds
    .filter((p) => !p.lock && (!p.fac || p.fac === 'RED') && dist(p, tgt) < 260)
    .sort((a, b) => dist(a, tgt) - dist(b, tgt)).slice(0, 12);
  const parts = [f, ...allies, ...crowd];
  if (parts.length < 3) return failMsg(f, '모쉬핏: 참여 인원이 부족합니다');
  const eff = { center: { x: tgt.x, y: tgt.y }, target: tgt, parts, phase: 'gather', t: 0, ring: 110, user: f };
  parts.forEach((p, i) => { p.lock = eff; p.follow = null; p.followT = 0; p.moshAng = (i / parts.length) * Math.PI * 2; });
  moshes.push(eff);
  addText(tgt.x, tgt.y - 50, 'MOSH PIT!', FACTIONS.RED.light, 20);
  return true;
}
function updateMosh(e, dt) {
  e.t += dt;
  e.parts = e.parts.filter((p) => !(p.dead));
  if (e.phase === 'gather') { if (!e.target.dead) { e.center.x = e.target.x; e.center.y = e.target.y; } }
  let allIn = true;
  for (const p of e.parts) {
    let tx, ty, sp;
    if (e.phase === 'gather') {
      tx = e.center.x + Math.cos(p.moshAng) * e.ring; ty = e.center.y + Math.sin(p.moshAng) * e.ring; sp = 260;
    } else { tx = e.center.x; ty = e.center.y; sp = 430; }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 8) {
      allIn = false;
      const s = Math.min(sp * dt, d);
      moveE(p, (dx / d) * s, (dy / d) * s);
      if (p.face !== undefined) { p.fx = dx / d; p.fy = dy / d; p.face = p.fx >= 0 ? 1 : -1; p.moving = true; }
    } else if (p.moving !== undefined) p.moving = false;
  }
  if (e.phase === 'gather' && (allIn || e.t > 1.7 || e.parts.length < 2)) { e.phase = 'charge'; e.t = 0; }
  else if (e.phase === 'charge' && e.t > 0.5) {
    const n = e.parts.length;
    const dmg = Math.min(70, 14 + 5 * n);
    for (const t of fighters) if (!t.dead && t.faction !== 'RED' && Math.hypot(t.x - e.center.x, t.y - e.center.y) < 95) {
      damage(t, dmg, { x: e.center.x, y: e.center.y }, 1);
    }
    addRing(e.center.x, e.center.y, FACTIONS.RED.color, 110, 0.6);
    addText(e.center.x, e.center.y - 30, `${n}인 모쉬핏!`, '#fff', 16);
    e.parts.forEach((p) => { p.lock = null; });
    e.done = true;
  }
}

// BLUE — SUMMON (오리지널 교복 여고생 소환체)
function castSummon(f) {
  if (summons.some((s) => s.owner === f)) return failMsg(f, '이미 소환체가 활동 중입니다');
  summons.push({ owner: f, x: f.x - f.fx * 28, y: f.y - f.fy * 28, r: 6, t: 10, atkCd: 0, face: f.face, anim: 0, lureT: 0, fac: 'BLUE', faction: 'BLUE' });
  addText(f.x, f.y - 46, 'SUMMON!', FACTIONS.BLUE.light, 20);
  addRing(f.x, f.y - 10, FACTIONS.BLUE.color, 70, 0.7);
  return true;
}
function updateSummon(s, dt) {
  s.t -= dt; s.anim += dt; s.atkCd -= dt; s.lureT -= dt;
  const o = s.owner;
  if (s.t <= 0 || o.dead) { s.done = true; addRing(s.x, s.y - 10, FACTIONS.BLUE.light, 40, 0.4); return; }
  let tgt = null, bd = 220;
  for (const e of fighters) {
    if (e.dead || e.faction === 'BLUE') continue;
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    if (d < bd) { bd = d; tgt = e; }
  }
  let gx, gy, stop;
  if (tgt) { gx = tgt.x; gy = tgt.y; stop = 24; } else { gx = o.x - o.fx * 30; gy = o.y - o.fy * 30; stop = 36; }
  const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy);
  if (d > stop) {
    const sp = 210 * dt;
    moveE(s, (dx / d) * sp, (dy / d) * sp);
    s.face = dx >= 0 ? 1 : -1;
  }
  if (Math.hypot(o.x - s.x, o.y - s.y) > 320) { s.x = o.x; s.y = o.y; }
  if (tgt && d < 32 && s.atkCd <= 0) {
    s.atkCd = 0.5; damage(tgt, 7, s); addSpark(tgt.x, tgt.y - 16, FACTIONS.BLUE.light);
  }
  if (s.lureT <= 0) {
    s.lureT = 0.4;
    let n = peds.filter((p) => p.follow === o).length;
    for (const p of peds) {
      if (n >= 16) break;
      if (p.lock || p.follow === o) continue;
      if (Math.hypot(p.x - o.x, p.y - o.y) < 230) { p.follow = o; p.followT = 8; p.followAng = rnd(0, 6.28); n++; }
    }
  }
}

// YELLOW — GRAFFITI WALL
function castWall(f) {
  const len = Math.hypot(f.fx, f.fy) || 1;
  const dx = f.fx / len, dy = f.fy / len;
  const cx = f.x + dx * 70, cy = f.y + dy * 70;
  const px = -dy, py = dx, half = 72;
  walls.push({ x1: cx - px * half, y1: cy - py * half, x2: cx + px * half, y2: cy + py * half, t: 18, born: time, owner: 'YELLOW', seed: Math.random() });
  addText(cx, cy - 20, 'GRAFFITI!', FACTIONS.YELLOW.light, 18);
  return true;
}

// ---------------------------------------------------------------------------
// 행인 NPC
// ---------------------------------------------------------------------------
const SKINS = ['#f1c7a3', '#e0ac82', '#c68a62', '#f6d5b8'];
const HAIRS = ['#1c1c24', '#3a2a1c', '#5a3a26', '#8a8a96', '#2a2a40'];
const SHIRTS = ['#6b7280', '#7c8591', '#8a7f72', '#5f6b7a', '#7a6f80', '#6d7d70'];
function spawnPeds(n) {
  peds = [];
  const total = ROADS.reduce((s, r) => s + r.rw * r.rh, 0);
  for (let i = 0; i < n; i++) {
    let pick = Math.random() * total, road = ROADS[0];
    for (const r of ROADS) { pick -= r.rw * r.rh; if (pick <= 0) { road = r; break; } }
    let x, y, tries = 0;
    do { x = road.x + rnd(6, road.rw - 6); y = road.y + rnd(6, road.rh - 6); tries++; } while (!roadOK(x, y, 4) && tries < 20);
    const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][(Math.random() * 4) | 0];
    peds.push({
      id: i, x, y, r: 4, dx: dir[0], dy: dir[1], sp: rnd(34, 58), turnT: rnd(0.5, 4), fac: null,
      cult: { RED: 0, YELLOW: 0, BLUE: 0 }, skin: SKINS[i % 4], hair: HAIRS[(Math.random() * 5) | 0], shirt: SHIRTS[(Math.random() * 6) | 0],
      follow: null, followT: 0, lock: null, followAng: 0,
    });
  }
}
function pickDir(p) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
  for (const d of dirs) {
    if (d[0] === -p.dx && d[1] === -p.dy) continue;
    if (roadOK(p.x + d[0] * 14, p.y + d[1] * 14, p.r)) { p.dx = d[0]; p.dy = d[1]; p.turnT = rnd(1.5, 5); return; }
  }
  p.dx = -p.dx; p.dy = -p.dy; p.turnT = rnd(1.5, 4);
}
function updatePed(p, dt) {
  if (p.lock) return;
  if (p.followT > 0) {
    p.followT -= dt;
    const o = p.follow;
    if (!o || o.dead || p.followT <= 0) { p.follow = null; p.followT = 0; return; }
    const tx = o.x + Math.cos(p.followAng) * 46, ty = o.y + Math.sin(p.followAng) * 46;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 8) moveE(p, (dx / d) * 120 * dt, (dy / d) * 120 * dt);
    return;
  }
  p.turnT -= dt;
  if (p.turnT <= 0 || !tryMove(p, p.x + p.dx * p.sp * dt, p.y + p.dy * p.sp * dt)) pickDir(p);
}
function updatePedCulture(dt) {
  const owned = shops.filter((s) => s.owner);
  for (const p of peds) {
    for (const s of owned) {
      const R = s.big ? 340 : 250, d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < R) p.cult[s.owner] = Math.min(1.6, p.cult[s.owner] + dt * 0.16 * (1 - d / R) * (s.big ? 1.6 : 1));
    }
    let best = null, bv = 0;
    for (const f of FACTION_ORDER) {
      p.cult[f] = Math.max(0, p.cult[f] - dt * 0.015);
      if (p.cult[f] > bv) { bv = p.cult[f]; best = f; }
    }
    if (best && bv >= 1 && (!p.fac || (best !== p.fac && bv >= 1.25 && p.cult[best] > p.cult[p.fac] + 0.2))) p.fac = best;
  }
}

// ---------------------------------------------------------------------------
// 상점 점령 / 음식점 / 영향력
// ---------------------------------------------------------------------------
const CAP_R = 62;
function updateShops(dt) {
  for (const s of retail) {
    s.flash = Math.max(0, s.flash - dt);
    const cnt = { RED: 0, YELLOW: 0, BLUE: 0 };
    for (const f of fighters) {
      if (f.dead || f.lock) continue;
      if (Math.hypot(f.x - s.ex, f.y - s.ey) < CAP_R) cnt[f.faction]++;
    }
    const act = FACTION_ORDER.filter((k) => cnt[k] > 0);
    if (act.length === 1) {
      const k = act[0];
      if (s.owner === k) {
        for (const o of FACTION_ORDER) if (o !== k) s.prog[o] = Math.max(0, s.prog[o] - dt * 30);
      } else {
        s.prog[k] += dt * 22 * (1 + 0.5 * (cnt[k] - 1));
        for (const o of FACTION_ORDER) if (o !== k) s.prog[o] = Math.max(0, s.prog[o] - dt * 15);
        if (s.prog[k] >= s.cap) captureShop(s, k);
      }
    } else if (act.length === 0) {
      for (const o of FACTION_ORDER) s.prog[o] = Math.max(0, s.prog[o] - dt * 6);
    }
  }
  for (const f of fighters) {
    if (f.dead) continue;
    for (const fd of foods) {
      if (Math.hypot(f.x - fd.ex, f.y - fd.ey) < 58) {
        if (f.stam < STATS.stamina) {
          f.stam = Math.min(STATS.stamina, f.stam + STATS.foodRegen * dt);
          if (Math.random() < dt * 4) addText(f.x + rnd(-8, 8), f.y - 34, '+', '#ffd166', 13);
        }
        break;
      }
    }
  }
}
function captureShop(s, k) {
  const prev = s.owner;
  s.owner = k; s.flash = 1;
  for (const o of FACTION_ORDER) s.prog[o] = 0;
  const F = FACTIONS[k];
  addRing(s.x, s.y, F.color, 80, 0.8);
  addText(s.x, s.y - 30, `${F.shopLabel} 점령!`, F.light, 16);
  if (player) {
    if (k === player.faction) toast(`${s.name} → ${F.shopLabel} 으로 변경!`, F.light);
    else if (prev === player.faction) toast(`${s.name} 을(를) ${F.name}에게 빼앗겼습니다`, '#ff9aa0');
  }
}

function updateInfluence() {
  for (const a of infl) a.fill(0);
  for (const s of retail) {
    if (!s.owner) continue;
    const a = infl[FACTION_ORDER.indexOf(s.owner)];
    addInfl(a, s.x, s.y, s.big ? 360 : 280, s.big ? 6 : 3, 1.4);
  }
  for (const k of FACTION_ORDER) score.peds[k] = 0;
  for (const p of peds) {
    if (!p.fac) continue;
    score.peds[p.fac]++;
    addInfl(infl[FACTION_ORDER.indexOf(p.fac)], p.x, p.y, 110, 0.35, 1);
  }
  const cnt = { RED: 0, YELLOW: 0, BLUE: 0 };
  for (const i of walkCells) {
    let best = -1, bv = 0.12;
    for (let k = 0; k < 3; k++) if (infl[k][i] > bv) { bv = infl[k][i]; best = k; }
    owner[i] = best;
    if (best >= 0) cnt[FACTION_ORDER[best]]++;
  }
  for (const k of FACTION_ORDER) {
    score.share[k] = cnt[k] / walkCells.length;
    score.shops[k] = retail.filter((s) => s.owner === k).length;
  }
  const need = Math.ceil(retail.length * WIN_RATIO);
  for (const k of FACTION_ORDER) if (score.shops[k] >= need && state === 'play') endGame(k);
}
function addInfl(arr, x, y, R, w, pw) {
  const gx0 = Math.max(0, ((x - R) / CELL) | 0), gx1 = Math.min(GW - 1, ((x + R) / CELL) | 0);
  const gy0 = Math.max(0, ((y - R) / CELL) | 0), gy1 = Math.min(GH - 1, ((y + R) / CELL) | 0);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const i = gy * GW + gx;
      if (!walk[i]) continue;
      const d = Math.hypot(gx * CELL + CELL / 2 - x, gy * CELL + CELL / 2 - y);
      if (d < R) arr[i] += w * Math.pow(1 - d / R, pw);
    }
  }
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------
const diffOf = (f) => DIFFICULTY[settings.diff[f.faction]] || DIFFICULTY.normal;

function aiMove(f, gx, gy, dt, stop = 14, repath = 1.4) {
  const ai = f.ai, I = f.intent;
  const dd = Math.hypot(gx - f.x, gy - f.y);
  if (dd <= stop) return true;
  ai.repT -= dt;
  if (!ai.path || ai.repT <= 0 || Math.hypot(gx - ai.pathGoal.x, gy - ai.pathGoal.y) > 50) {
    ai.path = findPath(f.x, f.y, gx, gy); ai.pathGoal = { x: gx, y: gy }; ai.repT = repath;
  }
  let tx = gx, ty = gy;
  if (dd > 40 && ai.path.length) {
    while (ai.path.length > 1 && Math.hypot(ai.path[0].x - f.x, ai.path[0].y - f.y) < 10) ai.path.shift();
    tx = ai.path[0].x; ty = ai.path[0].y;
    if (Math.hypot(tx - f.x, ty - f.y) < 8 && ai.path.length === 1) { tx = gx; ty = gy; }
  }
  const dx = tx - f.x, dy = ty - f.y, m = Math.hypot(dx, dy) || 1;
  I.mx = dx / m; I.my = dy / m;
  return false;
}

function ownedNear(s, k) { let n = 0; for (const o of retail) if (o.owner === k && Math.hypot(o.x - s.x, o.y - s.y) < 320) n++; return n; }

function chooseShop(f, D) {
  const allyT = new Set();
  for (const a of fighters) if (a !== f && a.faction === f.faction && a.ai && a.ai.shop) allyT.add(a.ai.shop.id);
  let best = null, bs = -1e9;
  for (const s of retail) {
    const d = Math.hypot(s.ex - f.x, s.ey - f.y);
    let sc = -d;
    if (s.owner === f.faction) {
      const threat = FACTION_ORDER.some((k) => k !== f.faction && s.prog[k] > 20);
      if (D.plan >= 0.8 && threat) sc = 900 - d; else continue;
    } else {
      if (D.plan >= 0.4 && s.owner) sc += 150 * D.plan;
      if (D.plan >= 0.8) sc += ownedNear(s, f.faction) * 40;
      if (s.big) sc += D.plan * 120;
      if (D.coop >= 0.9 && allyT.has(s.id)) sc -= 400;
    }
    sc += rnd(0, D.plan === 0 ? 450 : 60);
    if (sc > bs) { bs = sc; best = s; }
  }
  return best;
}

function aiDecide(f, D) {
  const ai = f.ai;
  if (ai.retreatT > 0) { ai.mode = 'retreat'; return; }
  const lowStam = f.stam < (D.plan >= 0.4 ? 38 : 18);
  let ne = null, nd = 1e9;
  for (const e of fighters) {
    if (e.dead || e.faction === f.faction) continue;
    const d = dist(e, f);
    if (d < nd) { nd = d; ne = e; }
  }
  if (f.hp < 28 && D.plan >= 0.4 && ne && nd < D.sight * 1.2) { ai.retreatT = 4; ai.mode = 'retreat'; ai.path = null; return; }
  if (ne && nd < D.sight && !(lowStam && nd > 120)) { ai.mode = 'fight'; ai.enemy = ne; return; }
  if (D.coop > 0.25 && Math.random() < D.coop) {
    for (const a of fighters) {
      if (a === f || a.dead || a.faction !== f.faction || !a.ai) continue;
      if (a.ai.mode === 'fight' && a.ai.enemy && !a.ai.enemy.dead && dist(a, f) < 500) { ai.mode = 'fight'; ai.enemy = a.ai.enemy; return; }
    }
  }
  if (lowStam && foods.length) {
    let bf = null, bd = 1e9;
    for (const fd of foods) { const d = Math.hypot(fd.ex - f.x, fd.ey - f.y); if (d < bd) { bd = d; bf = fd; } }
    ai.mode = 'food'; ai.goal = { x: bf.ex, y: bf.ey }; ai.shop = null; return;
  }
  const keep = ai.shop && ai.mode === 'goto' && ai.shop.owner !== f.faction && Math.random() < 0.85;
  if (!keep) ai.shop = chooseShop(f, D);
  ai.mode = 'goto';
}

function aiSpecial(f, D) {
  if (f.cdSpec > 0 || f.stam < STATS.special.cost) return;
  const ne = nearestEnemy(f, 260);
  if (!ne) return;
  if (f.faction === 'RED') {
    const allies = fighters.filter((a) => a !== f && !a.dead && a.faction === 'RED' && dist(a, f) < 450).length;
    const crowd = peds.filter((p) => !p.lock && (!p.fac || p.fac === 'RED') && dist(p, ne) < 260).length;
    if (allies + crowd >= 2 && (D.coop > 0.2 || allies === 0)) useSpecial(f);
  } else if (f.faction === 'BLUE') {
    useSpecial(f);
  } else if (f.hp < 60 || dist(ne, f) < 70) {
    useSpecial(f);
  }
}

function aiThink(f, dt) {
  const ai = f.ai, D = diffOf(f), I = f.intent;
  ai.t -= dt; ai.retreatT -= dt; ai.blockT -= dt;
  if (ai.t <= 0) { ai.t = D.react * rnd(0.7, 1.3); aiDecide(f, D); }
  if (ai.blockT > 0) I.block = true;

  ai.stuckT += dt;
  if (ai.stuckT > 0.8) {
    const moved = Math.hypot(f.x - ai.lastX, f.y - ai.lastY);
    if (moved < 4 && (I.mx || I.my)) {
      ai.stuckN++; ai.repT = 0; ai.path = null;
      if (ai.stuckN >= 2) { ai.stuckN = 0; ai.shop = null; ai.t = 0; }
    } else ai.stuckN = 0;
    ai.lastX = f.x; ai.lastY = f.y; ai.stuckT = 0;
  }

  if (ai.mode === 'fight') {
    const e = ai.enemy;
    if (!e || e.dead) { ai.mode = 'goto'; ai.t = 0; return; }
    const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy) || 1;
    I.aimx = dx / d; I.aimy = dy / d;
    if (d > 38) aiMove(f, e.x, e.y, dt, 34, 0.5);
    else {
      ai.atkWait -= dt;
      if (ai.atkWait <= 0 && f.cdAtk <= 0 && !I.block) {
        if (Math.random() < 0.55) I.punch = true; else I.kick = true;
        ai.atkWait = rnd(0.12, 0.5) * (1.4 - D.skill);
      }
    }
    if (e.atk && d < 70 && Math.random() < D.block * dt * 6) ai.blockT = 0.45;
    if (D.skill > 0.2 && Math.random() < D.skill * dt * 1.2) aiSpecial(f, D);
    if (d > D.sight * 1.5) { ai.mode = 'goto'; ai.t = 0; }
  } else if (ai.mode === 'retreat') {
    const b = FACTIONS[f.faction].base;
    aiMove(f, b.x, b.y, dt, 40, 1);
    if (ai.retreatT <= 0) ai.t = 0;
  } else if (ai.mode === 'food') {
    if (!ai.goal || aiMove(f, ai.goal.x, ai.goal.y, dt, 20, 1.2)) { if (f.stam >= 90) ai.t = 0; }
  } else {
    if (!ai.shop) { ai.t = 0; return; }
    if (aiMove(f, ai.shop.ex, ai.shop.ey, dt, 28, 1.4)) { /* 상점 입구에서 점령 대기 */ }
    if (ai.shop.owner === f.faction) { ai.shop = null; ai.t = 0; }
  }
}

// ---------------------------------------------------------------------------
// 전투원 업데이트
// ---------------------------------------------------------------------------
function updateFighter(f, dt) {
  f.animT += dt;
  if (f.dead) { f.respawnT -= dt; if (f.respawnT <= 0) respawn(f); return; }
  f.cdAtk -= dt; f.cdSpec -= dt; f.hitFlash -= dt; f.sinceHit += dt;
  if (f.atk) { f.atk.t -= dt; if (f.atk.t <= 0) f.atk = null; }
  if (f.sinceHit > 4) f.hp = Math.min(STATS.hp, f.hp + STATS.hpRegen * dt);
  const I = f.intent;
  I.mx = I.my = 0; I.block = I.punch = I.kick = I.spec = false; I.aimx = I.aimy = undefined;
  if (f.lock) { f.blocking = false; return; }

  if (f.ai) aiThink(f, dt);
  else {
    let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    if (!mx && !my) { mx = input.joy.x; my = input.joy.y; }
    I.mx = mx; I.my = my;
    I.block = input.block || keys.has('KeyL') || keys.has('ShiftLeft') || keys.has('ShiftRight');
    I.punch = input.q.punch; I.kick = input.q.kick; I.spec = input.q.spec;
    input.q.punch = input.q.kick = input.q.spec = false;
  }

  f.blocking = I.block && !f.atk;
  const spd = STATS.speed * (f.ai ? diffOf(f).speed : 1) * (f.blocking ? 0.5 : 1) * (f.atk ? 0.6 : 1);
  const m = Math.hypot(I.mx, I.my);
  if (m > 0.08) {
    const nx = I.mx / m, ny = I.my / m, k = Math.min(1, m);
    moveE(f, nx * spd * k * dt, ny * spd * k * dt);
    f.moving = true;
    if (I.aimx === undefined) { f.fx = nx; f.fy = ny; }
  } else f.moving = false;
  if (I.aimx !== undefined) { f.fx = I.aimx; f.fy = I.aimy; }
  if (f.fx > 0.1) f.face = 1; else if (f.fx < -0.1) f.face = -1;

  if (I.punch) attack(f, 'punch');
  else if (I.kick) attack(f, 'kick');
  if (I.spec) useSpecial(f);
}

// ---------------------------------------------------------------------------
// 업데이트 루프
// ---------------------------------------------------------------------------
function update(dt) {
  time += dt;
  for (const f of fighters) updateFighter(f, dt);
  for (const p of peds) updatePed(p, dt);
  for (const e of moshes) updateMosh(e, dt);
  moshes = moshes.filter((e) => !e.done);
  for (const s of summons) updateSummon(s, dt);
  summons = summons.filter((s) => !s.done);
  for (const w of walls) w.t -= dt;
  walls = walls.filter((w) => w.t > 0);
  updateShops(dt);
  for (const e of fx) e.t += dt;
  fx = fx.filter((e) => e.t < e.max);

  pedTimer += dt; if (pedTimer >= 0.5) { updatePedCulture(pedTimer); pedTimer = 0; }
  inflTimer += dt; if (inflTimer >= 0.5) { updateInfluence(); inflTimer = 0; }
  hudTimer += dt; if (hudTimer >= 0.1) { updateHUD(); hudTimer = 0; }

  if (player) {
    const tx = player.x - VW / zoom / 2, ty = player.y - VH / zoom / 2;
    const k = Math.min(1, dt * 8);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }
}

// ---------------------------------------------------------------------------
// 렌더링
// ---------------------------------------------------------------------------
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = VW * DPR; canvas.height = VH * DPR;
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  zoom = clamp(Math.min(VW, VH) / 620, 0.75, 1.25);
}
window.addEventListener('resize', resize);

const inView = (x, y, pad = 60) => x > cam.x - pad && x < cam.x + VW / zoom + pad && y > cam.y - pad && y < cam.y + VH / zoom + pad;

function drawShop(s) {
  if (!inView(s.x, s.y, 140)) return;
  const F = s.owner ? FACTIONS[s.owner] : null;
  const x = s.x - s.w / 2, y = s.y - s.h / 2;
  ctx.fillStyle = F ? F.dark : '#2e2e3b';
  ctx.beginPath(); ctx.roundRect(x, y, s.w, s.h, 5); ctx.fill();
  ctx.fillStyle = F ? F.color : '#4b4b5e';
  ctx.beginPath(); ctx.roundRect(x, y, s.w, 10, [5, 5, 0, 0]); ctx.fill();
  if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.6})`; ctx.fillRect(x, y, s.w, s.h); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = s.kind === 'food' ? s.name : (F ? F.shopLabel : s.name);
  ctx.font = s.big ? '800 15px sans-serif' : '700 10px sans-serif';
  ctx.fillStyle = '#fff'; ctx.fillText(s.big ? s.name : label, s.x, s.y + 6);
  ctx.font = `${s.big ? 20 : 12}px sans-serif`;
  ctx.fillText(s.kind === 'food' ? '🍜' : (F ? F.icon : '🛍️'), s.x, s.y - (s.big ? 10 : 4) + (s.big ? 0 : 1));
  if (s.kind === 'shop') {
    for (const k of FACTION_ORDER) {
      if (s.prog[k] > 1) {
        const w = s.w * (s.prog[k] / s.cap);
        ctx.fillStyle = FACTIONS[k].color; ctx.fillRect(x, y + s.h + 2, w, 4);
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x + w, y + s.h + 2, s.w - w, 4);
        break;
      }
    }
  }
}

function drawFighter(f) {
  if (!inView(f.x, f.y)) return;
  if (f.dead) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(f.x, f.y - 3, 12, 5, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; return;
  }
  drawChar(ctx, {
    x: f.x, y: f.y, look: f.look, color: f.color, dark: f.dark, light: f.light, face: f.face,
    t: f.animT, moving: f.moving, atk: f.atk, blocking: f.blocking, flash: f.hitFlash > 0, scale: 1.1,
  });
  const w = 26;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(f.x - w / 2, f.y - 42, w, 4);
  ctx.fillStyle = f.hp > 30 ? '#3ddc84' : '#ff6b6b'; ctx.fillRect(f.x - w / 2, f.y - 42, (w * f.hp) / STATS.hp, 4);
  if (f === player) {
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(f.x, f.y - 48); ctx.lineTo(f.x - 5, f.y - 56); ctx.lineTo(f.x + 5, f.y - 56); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = f.color; ctx.fillRect(f.x - 3, f.y - 50, 6, 4);
  }
}

function drawWall(w) {
  const age = Math.min(1, (time - w.born) / 0.35);
  const x2 = w.x1 + (w.x2 - w.x1) * age, y2 = w.y1 + (w.y2 - w.y1) * age;
  const fade = Math.min(1, w.t / 2);
  ctx.save(); ctx.globalAlpha = fade;
  ctx.lineCap = 'round';
  ctx.strokeStyle = FACTIONS.YELLOW.dark; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = FACTIONS.YELLOW.color; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = FACTIONS.YELLOW.light; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w.x1, w.y1 - 2); ctx.lineTo(x2, y2 - 2); ctx.stroke();
  ctx.strokeStyle = FACTIONS.YELLOW.color; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6, px = w.x1 + (x2 - w.x1) * t, py = w.y1 + (y2 - w.y1) * t, len = 8 + ((w.seed * (i + 3) * 37) % 12);
    ctx.beginPath(); ctx.moveTo(px, py + 6); ctx.lineTo(px, py + 6 + len); ctx.stroke();
  }
  ctx.restore();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#101016'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, -cam.x * DPR * zoom, -cam.y * DPR * zoom);
  ctx.drawImage(staticMap, 0, 0);

  // 영역 오버레이
  for (const i of walkCells) {
    const o = owner[i];
    if (o < 0) continue;
    const x = (i % GW) * CELL, y = ((i / GW) | 0) * CELL;
    if (!inView(x, y, 20)) continue;
    ctx.fillStyle = FACTIONS[FACTION_ORDER[o]].color;
    ctx.globalAlpha = clamp(0.1 + infl[o][i] * 0.05, 0.1, 0.3);
    ctx.fillRect(x, y, CELL, CELL);
  }
  ctx.globalAlpha = 1;

  // 구역 이름
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 13px sans-serif';
  for (const z of ZONE_LABELS) {
    if (!inView(z.x, z.y, 120)) continue;
    ctx.fillStyle = z.faction ? FACTIONS[z.faction].light : z.color; ctx.globalAlpha = 0.85;
    ctx.fillText(z.text, z.x, z.y);
  }
  ctx.globalAlpha = 1;
  ctx.font = '16px sans-serif'; ctx.fillText('🚇', 1100, 880);

  for (const s of shops) drawShop(s);
  for (const w of walls) drawWall(w);

  // 모쉬핏 링
  for (const e of moshes) {
    ctx.strokeStyle = FACTIONS.RED.color; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 14);
    ctx.beginPath(); ctx.arc(e.center.x, e.center.y, e.phase === 'gather' ? e.ring : e.ring * (1 - e.t / 0.5), 0, 7); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  // 행인
  for (const p of peds) {
    if (!inView(p.x, p.y)) continue;
    const col = p.fac ? FACTIONS[p.fac].color : p.shirt;
    drawPed(ctx, p, col, time);
    if (p.fac) { ctx.strokeStyle = FACTIONS[p.fac].light; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p.x, p.y, 7, 3, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    if (p.followT > 0) { ctx.font = '10px sans-serif'; ctx.fillStyle = '#ff8fc0'; ctx.fillText('♥', p.x, p.y - 22 + Math.sin(time * 5 + p.id) * 2); }
  }

  const list = [...fighters, ...summons].sort((a, b) => a.y - b.y);
  for (const e of list) {
    if (e.owner) {
      if (inView(e.x, e.y)) drawSummon(ctx, { x: e.x, y: e.y, face: e.face, t: e.anim, life: Math.min(1, e.t / 1.5) });
    } else drawFighter(e);
  }

  // 이펙트
  for (const e of fx) {
    const k = e.t / e.max;
    if (e.k === 'text') {
      ctx.globalAlpha = 1 - k; ctx.font = `800 ${e.size}px sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(e.text, e.x, e.y - k * 26);
      ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y - k * 26); ctx.globalAlpha = 1;
    } else if (e.k === 'ring') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * k, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (e.k === 'spark') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, r1 = 3 + k * 6, r2 = 7 + k * 10;
        ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1); ctx.lineTo(e.x + Math.cos(a) * r2, e.y + Math.sin(a) * r2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  drawMinimap();
}

function drawMinimap() {
  const mw = mini.width, mh = mini.height, sx = mw / WORLD.w, sy = mh / WORLD.h;
  mctx.drawImage(miniStatic, 0, 0);
  for (const i of walkCells) {
    const o = owner[i];
    if (o < 0) continue;
    mctx.fillStyle = FACTIONS[FACTION_ORDER[o]].color; mctx.globalAlpha = 0.75;
    mctx.fillRect((i % GW) * CELL * sx, ((i / GW) | 0) * CELL * sy, CELL * sx + 0.6, CELL * sy + 0.6);
  }
  mctx.globalAlpha = 1;
  for (const s of shops) {
    mctx.fillStyle = s.kind === 'food' ? '#ffd166' : s.owner ? FACTIONS[s.owner].light : '#777';
    mctx.fillRect(s.x * sx - 1.5, s.y * sy - 1.5, s.big ? 5 : 3, s.big ? 5 : 3);
  }
  for (const f of fighters) {
    if (f.dead) continue;
    mctx.fillStyle = FACTIONS[f.faction].color;
    mctx.beginPath(); mctx.arc(f.x * sx, f.y * sy, f === player ? 4 : 3, 0, 7); mctx.fill();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = f === player ? 1.5 : 0.8; mctx.stroke();
  }
  mctx.strokeStyle = 'rgba(255,255,255,.8)'; mctx.lineWidth = 1;
  mctx.strokeRect(cam.x * sx, cam.y * sy, (VW / zoom) * sx, (VH / zoom) * sy);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function buildScoreRows() {
  $('score').innerHTML = FACTION_ORDER.map((k) => `<div class="srow" data-f="${k}"><b style="color:${FACTIONS[k].light}">${FACTIONS[k].name}</b><div class="t"><i style="background:${FACTIONS[k].color}"></i></div><span></span></div>`).join('');
}
function updateHUD() {
  if (!player) return;
  const F = FACTIONS[player.faction];
  $('hp-fill').style.width = (player.hp / STATS.hp) * 100 + '%';
  $('st-fill').style.width = (player.stam / STATS.stamina) * 100 + '%';
  $('hp-text').textContent = `HP ${Math.ceil(player.hp)}`;
  $('st-text').textContent = `STAMINA ${Math.floor(player.stam)}`;
  $('me-badge').innerHTML = `<i style="background:${F.color}"></i>${F.name} · ${player.name}${settings.spectate ? ' (관전)' : ''}`;
  const need = Math.ceil(retail.length * WIN_RATIO);
  $('me-info').innerHTML = `점령 상점 <b style="color:${F.light}">${score.shops[player.faction]}</b> / ${retail.length} (승리 ${need})<br>동화된 행인 ${score.peds[player.faction]}명`;
  for (const k of FACTION_ORDER) {
    const row = document.querySelector(`.srow[data-f="${k}"]`);
    if (!row) continue;
    row.querySelector('i').style.width = Math.round(score.share[k] * 100 * 1.6) + '%';
    row.querySelector('span').textContent = `🏪${score.shops[k]} · ${Math.round(score.share[k] * 100)}%`;
  }
  $('ko').classList.toggle('hidden', !player.dead);
  const spec = $('b-spec');
  $('spec-name').textContent = F.specialKo;
  spec.style.borderColor = F.color;
  $('spec-cd').style.height = Math.max(0, Math.min(1, player.cdSpec / STATS.special.cd)) * 100 + '%';
  spec.style.opacity = player.stam < STATS.special.cost ? 0.6 : 1;
}

// ---------------------------------------------------------------------------
// 메뉴
// ---------------------------------------------------------------------------
function diffOptions(sel) {
  return Object.entries(DIFFICULTY).map(([k, v]) => `<option value="${k}"${sel === k ? ' selected' : ''}>${v.label}</option>`).join('');
}
function buildDiffUI(container) {
  const rows = [`<div class="drow"><label>전체 AI 난이도</label><select data-d="global">${diffOptions(settings.global)}${settings.global === 'custom' ? '<option value="custom" selected>개별 설정</option>' : ''}</select></div>`];
  for (const k of FACTION_ORDER) {
    rows.push(`<div class="drow"><label><i style="background:${FACTIONS[k].color}"></i>${FACTIONS[k].name}</label><select data-d="${k}">${diffOptions(settings.diff[k])}</select></div>`);
  }
  container.innerHTML = rows.join('');
  container.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => {
    const d = sel.dataset.d;
    if (d === 'global') {
      if (sel.value === 'custom') return;
      settings.global = sel.value; for (const k of FACTION_ORDER) settings.diff[k] = sel.value;
    } else { settings.diff[d] = sel.value; settings.global = 'custom'; }
    saveSettings();
    document.querySelectorAll('#diff-box, #pause-diff').forEach(buildDiffUI);
  }));
}

function buildMenu() {
  const grid = $('faction-grid');
  grid.innerHTML = '';
  for (const k of FACTION_ORDER) {
    const F = FACTIONS[k];
    const card = document.createElement('div');
    card.className = 'fcard' + (settings.faction === k ? ' sel' : '');
    card.style.setProperty('--fc', F.color);
    card.innerHTML = `<div class="fhead">${F.name}<small>${F.en} · 본진: ${F.zone}</small></div><div class="fspec">특수기술 <b>${F.special}</b></div><div class="chars"></div>`;
    const chars = card.querySelector('.chars');
    CHARACTERS[k].forEach((c, idx) => {
      const el = document.createElement('div');
      if (c.reserved) {
        el.className = 'char locked'; el.innerHTML = '<span>?</span><small>SLOT 3<br>준비중</small>';
      } else {
        el.className = 'char' + (settings.faction === k && settings.char === idx ? ' sel' : '');
        el.style.setProperty('--fc', F.color);
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 76;
        drawChar(cv.getContext('2d'), { x: 30, y: 66, look: c.look, color: F.color, dark: F.dark, light: F.light, face: 1, scale: 1.8 });
        el.appendChild(cv);
        const nm = document.createElement('div'); nm.textContent = c.name; el.appendChild(nm);
        el.title = c.desc;
        el.addEventListener('click', () => { settings.faction = k; settings.char = idx; saveSettings(); buildMenu(); });
      }
      chars.appendChild(el);
    });
    grid.appendChild(card);
  }
  buildDiffUI($('diff-box'));
  $('spectate').checked = !!settings.spectate;
}

// ---------------------------------------------------------------------------
// 게임 흐름
// ---------------------------------------------------------------------------
function startGame() {
  shops = buildShops();
  retail = shops.filter((s) => s.kind === 'shop');
  foods = shops.filter((s) => s.kind === 'food');
  summons = []; moshes = []; walls = []; fx = [];
  spawnPeds(110);
  fighters = []; player = null;
  for (const k of FACTION_ORDER) {
    CHARACTERS[k].forEach((c, idx) => {
      if (c.reserved) return; // 3번 슬롯은 디자인 확정 후 reserved 를 지우면 자동 등장
      const isP = k === settings.faction && idx === settings.char;
      const f = createFighter(k, c, isP);
      if (isP) player = f;
      fighters.push(f);
    });
  }
  settings.spectate = $('spectate').checked; saveSettings();
  if (player) player.ai = settings.spectate ? newAI() : null;
  for (let i = 0; i < 8; i++) updatePedCulture(1);
  updateInfluence();
  buildScoreRows();
  time = 0;
  cam.x = player.x - VW / zoom / 2; cam.y = player.y - VH / zoom / 2;
  state = 'play';
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  buildDiffUI($('pause-diff'));
  updateHUD();
  toast('상점 입구에 서서 점령하세요!', FACTIONS[player.faction].light);
}
function togglePause() {
  if (state === 'play') { state = 'pause'; buildDiffUI($('pause-diff')); $('pause').classList.remove('hidden'); }
  else if (state === 'pause') { state = 'play'; $('pause').classList.add('hidden'); }
}
function toMenu() {
  state = 'menu';
  $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('end').classList.add('hidden'); $('menu').classList.remove('hidden');
  buildMenu();
}
function endGame(winner) {
  state = 'end';
  const F = FACTIONS[winner];
  const mine = player && player.faction === winner;
  $('end-title').textContent = mine ? `${F.name} 승리! 🎉` : `${F.name}이(가) 홍대를 차지했습니다`;
  $('end-title').style.color = F.light;
  $('end-body').textContent = `${F.name} 점령 상점 ${score.shops[winner]}개 · 영향력 ${Math.round(score.share[winner] * 100)}% · 플레이 시간 ${Math.floor(time / 60)}분 ${Math.floor(time % 60)}초`;
  $('end').classList.remove('hidden');
}

$('btn-start').addEventListener('click', startGame);
$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', togglePause);
$('btn-quit').addEventListener('click', toMenu);
$('btn-again').addEventListener('click', startGame);
$('btn-menu').addEventListener('click', toMenu);

// ---------------------------------------------------------------------------
// 부팅
// ---------------------------------------------------------------------------
resize();
staticMap = buildStatic();
miniStatic = document.createElement('canvas');
miniStatic.width = mini.width; miniStatic.height = mini.height;
miniStatic.getContext('2d').drawImage(staticMap, 0, 0, mini.width, mini.height);
buildMenu();

let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
  if (state === 'play') update(dt);
  if (state !== 'menu') render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 디버그/테스트 훅
window.__hd = {
  start: startGame,
  step(n = 60, dt = 1 / 30) { for (let i = 0; i < n && state === 'play'; i++) update(dt); },
  get info() {
    return { state, time, score, fighters: fighters.map((f) => ({ n: f.name, F: f.faction, hp: Math.round(f.hp), st: Math.round(f.stam), mode: f.ai && f.ai.mode, x: Math.round(f.x), y: Math.round(f.y) })), shops: shops.length, retail: retail.length, foods: foods.length, peds: peds.length, pedsAssim: peds.filter((p) => p.fac).length };
  },
};
