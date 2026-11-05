// 홍대2026 — 정적 데이터 (진영, 캐릭터, 능력치, 지도)
// 새 캐릭터/진영/구역을 추가하려면 이 파일만 수정하면 됩니다.

export const WORLD = { w: 2400, h: 1800 };
export const WIN_RATIO = 0.6; // 점령 가능 상점의 이 비율 이상을 차지하면 승리

export const FACTION_ORDER = ['RED', 'YELLOW', 'BLUE'];

export const FACTIONS = {
  RED: {
    id: 'RED', name: '힙합계', en: 'HIP-HOP',
    color: '#e2454f', dark: '#7d1f27', light: '#ff9aa0',
    special: 'MOSH PIT', specialKo: '모쉬핏',
    shopLabel: '클럽', icon: '🎧', zone: '홍대 클럽 거리',
    base: { x: 800, y: 620 },
  },
  YELLOW: {
    id: 'YELLOW', name: '미술계', en: 'ART',
    color: '#f2c230', dark: '#7d6209', light: '#ffe68a',
    special: 'GRAFFITI WALL', specialKo: '그래피티 월',
    shopLabel: '화방', icon: '🎨', zone: '화방·미술용품 거리',
    base: { x: 700, y: 1250 },
  },
  BLUE: {
    id: 'BLUE', name: '서브컬처계', en: 'SUBCULTURE',
    color: '#3b82f6', dark: '#1b3f85', light: '#9cc2ff',
    special: 'SUMMON', specialKo: '소환',
    shopLabel: '굿즈샵', icon: '🎀', zone: 'AK플라자·굿즈샵 거리',
    base: { x: 1700, y: 900 },
  },
};

// 진영별 캐릭터 3슬롯. 세 번째 슬롯은 추후 디자인 예정이라 reserved 로만 확보한다.
// reserved 를 지우고 name/look 등을 채우면 게임에 자동으로 등장한다 (look 은 game.js 의 LOOKS 에 추가).
export const CHARACTERS = {
  RED: [
    { id: 'dj', name: 'DJ', gender: 'M', look: 'dj', desc: '클럽 문화의 상징. 헤드폰과 선글라스.' },
    { id: 'rapper', name: '래퍼', gender: 'M', look: 'rapper', desc: '버킷햇과 체인. 거리의 목소리.' },
    { id: 'red-slot3', reserved: true },
  ],
  YELLOW: [
    { id: 'artstudent', name: '미대생', gender: 'F', look: 'artstudent', desc: '에코백을 멘 현대적인 미대생.' },
    { id: 'painter', name: '화가', gender: 'M', look: 'painter', desc: '베레모와 물감 묻은 작업복.' },
    { id: 'yellow-slot3', reserved: true },
  ],
  BLUE: [
    { id: 'mangaka', name: '만화가', gender: 'F', look: 'mangaka', desc: '안경과 펜, 스케치북.' },
    { id: 'otaku', name: '오타쿠', gender: 'M', look: 'otaku', desc: '뱃지 가득한 백팩.' },
    { id: 'blue-slot3', reserved: true },
  ],
};

// 모든 캐릭터 공통 능력치 (진영/캐릭터 차이는 외형과 특수 기술뿐)
export const STATS = {
  hp: 100,
  stamina: 100,
  speed: 155,
  punch: { dmg: 6, range: 36, cd: 0.32 },
  kick: { dmg: 10, range: 46, cd: 0.55 },
  blockMul: 0.15,           // 블록 시 받는 피해 배율
  special: { cost: 40, cd: 8 },
  foodRegen: 35,            // 음식점에서 초당 스태미나 회복
  hpRegen: 3,               // 4초간 피격이 없으면 초당 체력 회복
  respawn: 6,
};

// AI 난이도: 공격력이 아니라 판단/반응/협력/전략 차이
export const DIFFICULTY = {
  easy:   { label: '쉬움',      react: 1.3,  sight: 130, skill: 0.15, block: 0.1,  coop: 0,   plan: 0,   speed: 0.9 },
  normal: { label: '보통',      react: 0.8,  sight: 190, skill: 0.4,  block: 0.3,  coop: 0.3, plan: 0.4, speed: 0.97 },
  hard:   { label: '어려움',    react: 0.45, sight: 260, skill: 0.7,  block: 0.55, coop: 0.6, plan: 0.8, speed: 1 },
  expert: { label: '매우 어려움', react: 0.25, sight: 330, skill: 0.95, block: 0.8,  coop: 1,   plan: 1,   speed: 1 },
};

// ---------------------------------------------------------------------------
// 홍대 지도 (실제 홍대 일대의 구조를 단순화한 근사 레이아웃)
// 좌표: x 동쪽(→), y 남쪽(↓). 1 단위 ≈ 약 0.5m 로 가정한 게임 좌표.
// 실제 OSM 도로 데이터를 가져와 ROADS 를 교체하면 더 정확한 지도로 확장할 수 있다.
// ---------------------------------------------------------------------------
const H = (y, x1, x2, w, name, kind = 'alley') => ({ o: 'h', c: y, a: x1, b: x2, w, name, kind, x: x1, y: y - w / 2, rw: x2 - x1, rh: w });
const V = (x, y1, y2, w, name, kind = 'alley') => ({ o: 'v', c: x, a: y1, b: y2, w, name, kind, x: x - w / 2, y: y1, rw: w, rh: y2 - y1 });

export const ROADS = [
  H(300, 0, 2400, 90, '양화로', 'main'),
  H(620, 300, 2100, 50, '어울마당로', 'street'),
  H(900, 200, 2200, 70, '홍익로', 'main'),
  H(1250, 0, 2400, 60, '와우산로', 'main'),
  H(1550, 0, 2400, 90, '큰 도로', 'main'),
  V(1100, 300, 1550, 60, '레드로드', 'street'),
  V(500, 300, 1550, 40, '', 'street'),
  V(1700, 300, 1550, 40, '', 'street'),
  V(2100, 300, 1550, 50, '', 'street'),
  V(800, 620, 1250, 30), V(1400, 620, 1250, 30), V(300, 620, 1250, 30),
  H(760, 300, 1700, 30), H(1080, 300, 2100, 30),
  V(950, 900, 1250, 24), V(1250, 620, 900, 24), H(1400, 300, 2100, 28), V(1900, 900, 1550, 26),
];

export const PLAZA = { x: 1000, y: 840, rw: 200, rh: 120 }; // 홍대입구역 앞 광장
export const AK = { x: 1550, y: 820, w: 220, h: 80, ex: 1550, ey: 885, name: 'AK플라자' };

export const ZONE_LABELS = [
  { text: '홍대입구역', x: 1100, y: 905, color: '#ffffff' },
  { text: '홍대 클럽 거리', x: 800, y: 575, faction: 'RED' },
  { text: '화방·미술용품 거리', x: 700, y: 1205, faction: 'YELLOW' },
  { text: 'AK플라자', x: 1550, y: 770, faction: 'BLUE' },
];

export const SHOP_NAMES = ['편의점', '카페', '옷가게', '액세서리', '서점', '잡화점', '헬스장', '네일샵', '사진관', '안경점', '음반가게', '소품샵', '타투샵', '보드게임카페', '문구점'];
export const FOOD_NAMES = ['분식', '라멘', '치킨', '곱창', '국밥', '샌드위치', '떡볶이', '삼겹살', '피자', '베이커리'];
