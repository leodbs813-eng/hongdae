# 홍대2026 (HONGDAE 2026)

홍대의 세 문화(힙합 · 미술 · 서브컬처)가 상점과 행인을 차지하며 거리의 주도권을 두고 경쟁하는 **오픈월드 액션·영역 점령 웹게임** 프로토타입입니다.
빌드 단계가 없는 순수 정적 사이트(HTML + ES Modules + Canvas)라 GitHub → Vercel 로 바로 배포됩니다.

## 실행

```bash
npm run dev        # http://localhost:3000  (또는 python3 -m http.server 3000)
```

> `index.html` 을 더블클릭(file://)하면 ES Module 제한으로 동작하지 않습니다. 반드시 로컬 서버로 여세요.

## 배포 (GitHub + Vercel)

1. GitHub 에서 새 저장소(예: `hongdae2026`)를 만든다.
2. 이 폴더에서:
   ```bash
   git init
   git add .
   git commit -m "홍대2026 prototype"
   git branch -M main
   git remote add origin https://github.com/<내계정>/hongdae2026.git
   git push -u origin main
   ```
3. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** 로 방금 만든 저장소 선택.
4. Framework Preset: **Other**, Build Command 비움, Output Directory 비움(루트) → **Deploy**.
5. 이후 `main` 에 push 할 때마다 자동 재배포됩니다. 모바일에서는 "홈 화면에 추가"로 웹앱처럼 쓸 수 있습니다.

## 조작법

| 동작 | PC | 모바일 |
|---|---|---|
| 이동 | WASD / 방향키 | 왼쪽 조이스틱 |
| 주먹 / 발차기 | J / K | 버튼 |
| 블록 | L / Shift (누르고 있기) | 버튼 |
| 특수 기술 | Space (스태미나 40) | 버튼 |
| 일시정지 | Esc / P | ⏸ |

## 구현된 시스템

- **3개 진영 / 캐릭터 선택**: RED 힙합계(DJ·래퍼), YELLOW 미술계(미대생·화가), BLUE 서브컬처계(만화가·오타쿠). 모든 캐릭터는 동일한 능력치이며 외형만 다릅니다.
- **세 번째 캐릭터 슬롯**: `src/data.js` 의 `CHARACTERS` 에 `reserved: true` 로 자리만 확보(선택 화면에 "준비중" 표시). 디자인이 확정되면 `reserved` 를 지우고 `name/look` 을 채운 뒤 `src/sprites.js` 의 `LOOKS` 에 외형을 추가하면 AI 로 자동 합류합니다. (현재는 총 6명: 플레이어 1 + AI 5)
- **전투**: 주먹, 발차기(스태미나 소모 없음), 블록. 체력/스태미나 별도 관리, KO 후 본진 부활.
- **특수 기술**
  - RED **MOSH PIT** — 아군 + 행인이 적 주위로 원형으로 모인 뒤 중앙으로 동시 돌진, 인원이 많을수록 강함 (최소 3명).
  - BLUE **SUMMON** — 오리지널 교복 소녀 소환체가 10초간 따라다니며 전투, 주변 행인을 매료해 8초간 따라오게 함.
  - YELLOW **GRAFFITI WALL** — 바라보는 방향에 벽 생성, 아군은 통과 / 타 진영은 차단 (18초).
- **상점 점령**: 상점 입구에 서 있으면 게이지가 차고, 점령되면 업종이 바뀝니다(클럽 / 화방 / 굿즈샵) + 진영 색상 표시. AK플라자는 대형 거점.
- **행인 NPC 동화**: 110명의 행인이 도로를 돌아다니며 주변 점령 상점의 영향으로 진영 색으로 동화. 상점 점령 ↔ 영향력이 직접 연결됩니다.
- **음식점**: 근처에 서면 스태미나 회복 (특수 기술은 스태미나 필요).
- **AI**: 쉬움 / 보통 / 어려움 / 매우 어려움. 공격력이 아니라 반응 속도 · 시야 · 협력 · 방어 전략 · 후퇴 판단의 차이. 진영별 개별 설정 가능, 관전 모드(플레이어 없이 AI끼리 경쟁) 지원.
- **UI**: 체력/스태미나, 소속 진영, 특수 기술 버튼(쿨다운), 점령 상점 수, 진영별 영역 %, 미니맵(영역 색상), 캐릭터 선택, 시작/일시정지 메뉴.
- **승리 조건**: 점령 가능 상점의 60% (`WIN_RATIO`) 이상 차지.

## 지도에 대해

현재 지도는 홍대입구역 · 레드로드 · 홍익로 · 와우산로 · 어울마당로 · 양화로 · 골목길 · AK플라자 · 클럽 거리 · 화방 거리의 **대략적 배치를 단순화한 근사 레이아웃**입니다. 도로는 `src/data.js` 의 `ROADS` 한 곳에서 정의하므로, OpenStreetMap 등 실제 도로 데이터를 좌표 변환해 `ROADS` 를 교체하면 실제 지리에 더 가깝게 확장할 수 있습니다. 상점/음식점 이름은 일반 업종명이며 실제 점포가 아닙니다.

## 구조

```
index.html        화면 골격 (HUD, 메뉴)
style.css
src/data.js       진영 · 캐릭터 · 능력치 · 난이도 · 지도(ROADS) 데이터
src/world.js      도로 판정, 상점 배치(시드 고정), BFS 길찾기, 정적 배경
src/sprites.js    캐릭터/소환체/행인 스프라이트 (LOOKS 에 추가)
src/game.js       전투 · AI · 특수기술 · 점령 · 동화 · 렌더 · UI
sw.js, manifest.webmanifest, icon.svg   웹앱(PWA) 설정
vercel.json
```
