// 캐릭터 스프라이트 (캔버스 절차적 드로잉). 새 캐릭터는 LOOKS 에 look 함수를 추가하면 된다.
const SKIN = '#f1c7a3';

const LOOKS = {
  dj(g, c) {
    g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.arc(0, -26, 7.5, Math.PI, 0); g.stroke();
    g.fillStyle = '#111'; g.fillRect(-9, -27, 3, 6); g.fillRect(6, -27, 3, 6);
    g.fillRect(-1, -27, 7, 2.4);
    g.fillStyle = c.light; g.fillRect(-1, -20, 2, 13);
  },
  rapper(g, c) {
    g.fillStyle = '#1b1b1b';
    g.beginPath(); g.ellipse(0, -30, 9.5, 3, 0, 0, 7); g.fill();
    g.fillRect(-5.5, -36, 11, 6.5);
    g.strokeStyle = '#ffd24a'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, -19, 4.5, 0.1, Math.PI - 0.1); g.stroke();
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(0, -14.4, 1.6, 0, 7); g.fill();
  },
  artstudent(g, c) {
    g.fillStyle = '#5a3a26';
    g.beginPath(); g.arc(0, -26, 7, Math.PI, 0); g.fill();
    g.beginPath(); g.arc(-7.5, -22, 3.2, 0, 7); g.fill();
    g.fillRect(-7, -27, 3, 9);
    g.fillStyle = '#e8dcc0'; g.fillRect(-11, -17, 6, 8);
    g.strokeStyle = '#e8dcc0'; g.lineWidth = 1; g.beginPath(); g.moveTo(-8, -17); g.lineTo(-4, -20); g.stroke();
    g.fillStyle = '#4a6fa5'; g.fillRect(-6.5, -9, 13, 3);
  },
  painter(g, c) {
    g.fillStyle = '#2c2a4a';
    g.beginPath(); g.ellipse(0, -31, 8.5, 3.6, -0.15, 0, 7); g.fill();
    g.fillRect(-0.8, -35, 1.6, 3);
    g.fillStyle = '#3a2a1c'; g.fillRect(1, -23, 5.5, 1.5);
    const dots = ['#e2454f', '#3b82f6', '#3ddc84', '#fff'];
    dots.forEach((d, i) => { g.fillStyle = d; g.beginPath(); g.arc(-4 + i * 3, -14 + (i % 2) * 3, 1.4, 0, 7); g.fill(); });
    g.fillStyle = '#caa472'; g.beginPath(); g.ellipse(11, -12, 5.5, 3.8, 0.3, 0, 7); g.fill();
    ['#e2454f', '#3b82f6', '#fff'].forEach((d, i) => { g.fillStyle = d; g.beginPath(); g.arc(8.8 + i * 2.4, -12.5 + (i % 2), 1, 0, 7); g.fill(); });
  },
  mangaka(g, c) {
    g.fillStyle = '#1c1c28';
    g.beginPath(); g.arc(0, -26, 7.4, Math.PI * 0.95, Math.PI * 2.05); g.fill();
    g.fillRect(-7.4, -27, 3, 9); g.fillRect(4.4, -27, 3, 9);
    g.strokeStyle = '#222'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(1.8, -25, 2.3, 0, 7); g.stroke();
    g.beginPath(); g.arc(6.2, -25, 2.3, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(-12, -16, 6, 8);
    g.strokeStyle = '#999'; g.lineWidth = 0.8; g.strokeRect(-12, -16, 6, 8);
    g.strokeStyle = '#222'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(9, -16); g.lineTo(13, -21); g.stroke();
  },
  otaku(g, c) {
    g.fillStyle = '#4b5563'; g.fillRect(-12, -20, 6, 13);
    ['#ff7aa8', '#ffd24a', '#7ee0c3', '#e2454f'].forEach((d, i) => { g.fillStyle = d; g.beginPath(); g.arc(-9, -18 + i * 3, 1.3, 0, 7); g.fill(); });
    g.fillStyle = '#f5f5f5'; g.fillRect(-7, -31, 14, 2.6);
    g.strokeStyle = '#222'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(2, -25, 2.4, 0, 7); g.stroke();
    g.beginPath(); g.arc(6.4, -25, 2.4, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    for (let i = -4; i <= 4; i += 4) { g.beginPath(); g.moveTo(i, -20); g.lineTo(i, -7); g.stroke(); }
  },
};

// 기본 캐릭터 그리기. (x,y)=발 위치. face: +1 오른쪽 / -1 왼쪽
export function drawChar(g, o) {
  const { x, y, look, color, dark, light, face = 1, t = 0, moving = false, atk = null, blocking = false, flash = false, scale = 1, shadow = true } = o;
  g.save();
  g.translate(x, y);
  g.scale(face * scale, scale);
  if (shadow) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 0, 10, 4, 0, 0, 7); g.fill(); }
  const sw = moving ? Math.sin(t * 14) * 3 : 0;
  // 다리
  g.fillStyle = '#23232e';
  g.fillRect(-5, -8 + (sw > 0 ? 0 : 1), 3.4, 8 - (sw > 0 ? 0 : 1));
  g.fillRect(1.6, -8 + (sw > 0 ? 1 : 0), 3.4, 8 - (sw > 0 ? 1 : 0));
  if (atk && atk.type === 'kick') { g.fillStyle = '#23232e'; g.fillRect(3, -9, 14, 3.6); }
  // 몸통
  g.fillStyle = flash ? '#fff' : color;
  g.beginPath(); g.roundRect(-7, -21, 14, 14, 4); g.fill();
  g.fillStyle = dark; g.fillRect(-7, -9, 14, 2.4);
  // 머리
  g.fillStyle = SKIN; g.beginPath(); g.arc(0, -26, 6.4, 0, 7); g.fill();
  g.fillStyle = '#222'; g.fillRect(2.2, -27, 1.8, 2.2);
  if (LOOKS[look]) LOOKS[look](g, { color, dark, light });
  // 팔 / 주먹
  g.fillStyle = SKIN;
  if (blocking) {
    g.beginPath(); g.arc(6, -19, 3, 0, 7); g.fill();
    g.beginPath(); g.arc(7, -14, 3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(8, -16, 11, -1.1, 1.1); g.stroke();
  } else if (atk && atk.type === 'punch') {
    g.fillRect(6, -17, 11, 3.4);
    g.beginPath(); g.arc(18, -15.3, 3.4, 0, 7); g.fill();
  } else {
    g.beginPath(); g.arc(8, -13 + sw * 0.3, 2.8, 0, 7); g.fill();
    g.beginPath(); g.arc(-8, -13 - sw * 0.3, 2.8, 0, 7); g.fill();
  }
  g.restore();
}

// 오리지널 교복 여고생 소환체 (기존 작품 캐릭터 아님)
export function drawSummon(g, o) {
  const { x, y, face = 1, t = 0, life = 1 } = o;
  g.save();
  g.translate(x, y);
  // 오라
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  const grd = g.createRadialGradient(0, -16, 2, 0, -16, 30);
  grd.addColorStop(0, `rgba(156,194,255,${0.45 * life})`); grd.addColorStop(1, 'rgba(156,194,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, -16, 26 + pulse * 4, 0, 7); g.fill();
  g.scale(face, 1);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 0, 9, 3.5, 0, 0, 7); g.fill();
  const sw = Math.sin(t * 12) * 2;
  g.fillStyle = SKIN; g.fillRect(-4, -9, 2.6, 9 + (sw > 0 ? 0 : -1)); g.fillRect(1.4, -9, 2.6, 9 + (sw > 0 ? -1 : 0));
  g.fillStyle = '#f3f3fb'; g.fillRect(-4, -4, 2.6, 4); g.fillRect(1.4, -4, 2.6, 4); // 양말
  g.fillStyle = '#26324f'; // 치마
  g.beginPath(); g.moveTo(-7, -13); g.lineTo(7, -13); g.lineTo(9, -7); g.lineTo(-9, -7); g.closePath(); g.fill();
  g.fillStyle = '#26324f'; g.beginPath(); g.roundRect(-6, -22, 12, 10, 3); g.fill(); // 블레이저
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-3, -22); g.lineTo(3, -22); g.lineTo(0, -17); g.closePath(); g.fill();
  g.fillStyle = '#8fd3ff'; g.fillRect(-1.8, -18.5, 3.6, 2.4); // 리본
  // 쌍갈래 머리
  g.fillStyle = '#b9a7ff';
  const sway = Math.sin(t * 8) * 2;
  g.beginPath(); g.ellipse(-8, -22 + sway * 0.3, 2.8, 7, 0.15, 0, 7); g.fill();
  g.beginPath(); g.ellipse(8, -22 - sway * 0.3, 2.8, 7, -0.15, 0, 7); g.fill();
  g.fillStyle = SKIN; g.beginPath(); g.arc(0, -27, 6.6, 0, 7); g.fill();
  g.fillStyle = '#b9a7ff'; g.beginPath(); g.arc(0, -28.5, 7, Math.PI, 0); g.fill();
  g.fillRect(-7, -29, 14, 3);
  g.fillStyle = '#2a2a5a'; g.beginPath(); g.ellipse(2.6, -26, 1.5, 2.1, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(-2.2, -26, 1.5, 2.1, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.fillRect(2.4, -27, 0.9, 0.9); g.fillRect(-2.4, -27, 0.9, 0.9);
  g.fillStyle = '#8fd3ff'; g.beginPath(); g.arc(-8, -29, 1.8, 0, 7); g.arc(8, -29, 1.8, 0, 7); g.fill();
  g.restore();
}

// 행인 (작은 실루엣)
export function drawPed(g, p, color, t) {
  g.save();
  g.translate(p.x, p.y);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 0, 5, 2, 0, 0, 7); g.fill();
  const sw = Math.sin(t * 10 + p.id) * 1.2;
  g.fillStyle = '#2b2b36'; g.fillRect(-2.6, -4, 2, 4 + sw * 0.3); g.fillRect(0.6, -4, 2, 4 - sw * 0.3);
  g.fillStyle = color; g.beginPath(); g.roundRect(-4, -11, 8, 8, 2); g.fill();
  g.fillStyle = p.skin; g.beginPath(); g.arc(0, -14, 3.3, 0, 7); g.fill();
  g.fillStyle = p.hair; g.beginPath(); g.arc(0, -15, 3.4, Math.PI, 0); g.fill();
  g.restore();
}

export const LOOK_IDS = Object.keys(LOOKS);
