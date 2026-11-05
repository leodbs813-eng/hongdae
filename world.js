// 지도 생성: 도로 판정, 상점 배치, 길찾기 그리드, 정적 배경 렌더링
import { WORLD, ROADS, PLAZA, AK, FACTIONS, FACTION_ORDER, SHOP_NAMES, FOOD_NAMES } from './data.js';

export const CELL = 20;
export const GW = WORLD.w / CELL;
export const GH = WORLD.h / CELL;

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function inRoad(x, y) {
  for (let i = 0; i < ROADS.length; i++) {
    const r = ROADS[i];
    if (x >= r.x && x <= r.x + r.rw && y >= r.y && y <= r.y + r.rh) return true;
  }
  return x >= PLAZA.x && x <= PLAZA.x + PLAZA.rw && y >= PLAZA.y && y <= PLAZA.y + PLAZA.rh;
}

// ---- 길찾기 그리드 ----
export const walk = new Uint8Array(GW * GH);
export const walkCells = [];
for (let gy = 0; gy < GH; gy++) {
  for (let gx = 0; gx < GW; gx++) {
    if (inRoad(gx * CELL + CELL / 2, gy * CELL + CELL / 2)) {
      walk[gy * GW + gx] = 1;
      walkCells.push(gy * GW + gx);
    }
  }
}

export const cellIdx = (x, y) =>
  Math.max(0, Math.min(GH - 1, (y / CELL) | 0)) * GW + Math.max(0, Math.min(GW - 1, (x / CELL) | 0));

function nearestWalk(x, y) {
  const i = cellIdx(x, y);
  if (walk[i]) return i;
  const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        if (walk[ny * GW + nx]) return ny * GW + nx;
      }
    }
  }
  return i;
}

const parent = new Int32Array(GW * GH);
const queue = new Int32Array(GW * GH);

// BFS (4방향). 코너만 남긴 월드 좌표 경로를 반환한다.
export function findPath(sx, sy, gx, gy) {
  const s = nearestWalk(sx, sy), g = nearestWalk(gx, gy);
  parent.fill(-2);
  let qh = 0, qt = 0;
  queue[qt++] = s; parent[s] = -1;
  let found = s === g;
  while (qh < qt && !found) {
    const c = queue[qh++];
    const cx = c % GW, cy = (c / GW) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (!walk[n] || parent[n] !== -2) continue;
      parent[n] = c; queue[qt++] = n;
      if (n === g) { found = true; break; }
    }
  }
  if (!found) return [];
  const cells = [];
  for (let c = g; c !== -1; c = parent[c]) cells.push(c);
  cells.reverse();
  const pts = [];
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1], b = cells[i];
    const dir = b - a;
    const nextDir = i + 1 < cells.length ? cells[i + 1] - b : null;
    if (nextDir !== dir) pts.push({ x: (b % GW) * CELL + CELL / 2, y: ((b / GW) | 0) * CELL + CELL / 2 });
  }
  return pts;
}

// ---- 상점 배치 (시드 고정: 매번 같은 지도) ----
const SW = 54, SH = 40;

function candidatesAlong(road, side, out) {
  for (let t = road.a + 60; t < road.b - 40; t += 55) {
    let x, y, ex, ey;
    if (road.o === 'h') {
      x = t; y = road.c + side * (road.w / 2 + SH / 2 + 3);
      ex = t; ey = road.c + side * (road.w / 2 - 14);
    } else {
      x = road.c + side * (road.w / 2 + SW / 2 + 3); y = t;
      ex = road.c + side * (road.w / 2 - 14); ey = t;
    }
    if (valid(x, y)) out.push({ x, y, ex, ey, w: SW, h: SH });
  }
}

function valid(x, y) {
  if (x < 40 || y < 40 || x > WORLD.w - 40 || y > WORLD.h - 40) return false;
  const hw = SW / 2 - 1, hh = SH / 2 - 1;
  for (const dx of [-hw, 0, hw]) for (const dy of [-hh, 0, hh]) if (inRoad(x + dx, y + dy)) return false;
  if (Math.abs(x - AK.x) < AK.w / 2 + SW / 2 + 4 && Math.abs(y - AK.y) < AK.h / 2 + SH / 2 + 4) return false;
  return true;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function buildShops() {
  const rng = mulberry(2026);
  const cands = [];
  for (const r of ROADS) { candidatesAlong(r, -1, cands); candidatesAlong(r, 1, cands); }
  for (let i = cands.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [cands[i], cands[j]] = [cands[j], cands[i]]; }

  const shops = [];
  const mk = (c, kind) => {
    const names = kind === 'food' ? FOOD_NAMES : SHOP_NAMES;
    const s = {
      id: shops.length, kind, name: names[(rng() * names.length) | 0],
      x: c.x, y: c.y, w: c.w, h: c.h, ex: c.ex, ey: c.ey,
      owner: null, prog: { RED: 0, YELLOW: 0, BLUE: 0 }, cap: 100, big: false, flash: 0,
    };
    shops.push(s); return s;
  };
  const free = (c, gap) => shops.every((s) => Math.hypot(s.x - c.x, s.y - c.y) >= gap);

  // 각 진영 본진 근처에 음식점 하나씩 보장
  for (const id of FACTION_ORDER) {
    const b = FACTIONS[id].base;
    let best = null, bd = 1e9;
    for (const c of cands) {
      const d = Math.hypot(c.x - b.x - 120, c.y - b.y);
      if (d < bd && free(c, 100)) { bd = d; best = c; }
    }
    if (best) mk(best, 'food');
  }
  // 점령 가능한 상점
  let retail = 0;
  for (const c of cands) {
    if (retail >= 58) break;
    if (free(c, 125)) { mk(c, 'shop'); retail++; }
  }
  // 나머지 음식점
  let foods = shops.filter((s) => s.kind === 'food').length;
  for (const c of cands) {
    if (foods >= 14) break;
    if (free(c, 95)) { mk(c, 'food'); foods++; }
  }
  // AK플라자 (대형 거점)
  const ak = {
    id: shops.length, kind: 'shop', name: AK.name, x: AK.x, y: AK.y, w: AK.w, h: AK.h, ex: AK.ex, ey: AK.ey,
    owner: 'BLUE', prog: { RED: 0, YELLOW: 0, BLUE: 0 }, cap: 220, big: true, flash: 0,
  };
  shops.push(ak);

  // 초기 소유: 본진 가장 가까운 상점 3개
  for (const id of FACTION_ORDER) {
    const b = FACTIONS[id].base;
    shops.filter((s) => s.kind === 'shop' && !s.owner)
      .sort((p, q) => dist(p, b) - dist(q, b)).slice(0, 3)
      .forEach((s) => { s.owner = id; });
  }
  return shops;
}

// ---- 정적 배경 (건물/도로) ----
export function buildStatic() {
  const sc = document.createElement('canvas');
  sc.width = WORLD.w; sc.height = WORLD.h;
  const g = sc.getContext('2d');
  const rng = mulberry(7);
  g.fillStyle = '#13131a';
  g.fillRect(0, 0, WORLD.w, WORLD.h);
  const tones = ['#1d1d27', '#212130', '#1a1a23', '#242433'];
  for (let y = 0; y < WORLD.h; y += 40) {
    for (let x = 0; x < WORLD.w; x += 40) {
      g.fillStyle = tones[(rng() * tones.length) | 0];
      g.fillRect(x + 1, y + 1, 38, 38);
      if (rng() < 0.22) {
        g.fillStyle = rng() < 0.5 ? 'rgba(255,214,120,.35)' : 'rgba(150,200,255,.25)';
        g.fillRect(x + 6 + ((rng() * 20) | 0), y + 6 + ((rng() * 20) | 0), 5, 4);
      }
    }
  }
  // 인도
  g.fillStyle = '#4b4b5c';
  for (const r of ROADS) g.fillRect(r.x - 3, r.y - 3, r.rw + 6, r.rh + 6);
  // 차도
  for (const r of ROADS) {
    g.fillStyle = r.kind === 'main' ? '#2b2b35' : r.kind === 'street' ? '#34343f' : '#3a3a46';
    g.fillRect(r.x, r.y, r.rw, r.rh);
  }
  // 중앙선
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2; g.setLineDash([16, 14]);
  for (const r of ROADS) {
    if (r.kind !== 'main') continue;
    g.beginPath();
    if (r.o === 'h') { g.moveTo(r.a, r.c); g.lineTo(r.b, r.c); } else { g.moveTo(r.c, r.a); g.lineTo(r.c, r.b); }
    g.stroke();
  }
  g.setLineDash([]);
  // 레드로드: 붉은 보도블록
  const rr = ROADS.find((r) => r.name === '레드로드');
  if (rr) { g.fillStyle = 'rgba(226,69,79,.10)'; g.fillRect(rr.x, rr.y, rr.rw, rr.rh); }
  // 광장 (홍대입구역)
  g.fillStyle = '#4d4d5e'; g.fillRect(PLAZA.x, PLAZA.y, PLAZA.rw, PLAZA.rh);
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
  for (let x = PLAZA.x; x <= PLAZA.x + PLAZA.rw; x += 20) { g.beginPath(); g.moveTo(x, PLAZA.y); g.lineTo(x, PLAZA.y + PLAZA.rh); g.stroke(); }
  for (let y = PLAZA.y; y <= PLAZA.y + PLAZA.rh; y += 20) { g.beginPath(); g.moveTo(PLAZA.x, y); g.lineTo(PLAZA.x + PLAZA.rw, y); g.stroke(); }
  // 도로 이름
  g.fillStyle = 'rgba(255,255,255,.34)'; g.font = '700 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const r of ROADS) {
    if (!r.name) continue;
    const n = Math.max(1, Math.floor((r.b - r.a) / 700));
    for (let i = 0; i < n; i++) {
      const t = r.a + ((i + 0.5) * (r.b - r.a)) / n;
      g.save();
      if (r.o === 'h') g.translate(t, r.c); else { g.translate(r.c, t); g.rotate(-Math.PI / 2); }
      g.fillText(r.name, 0, 0);
      g.restore();
    }
  }
  return sc;
}
