// 만세력 약식 계산 — 의존성 0, 순수 함수.
// 일주: 율리우스적일(JDN) 앵커 방식. 검증 앵커: 1900-01-01=갑술, 2000-01-01=무오.
// 년주: 입춘 기준(절기 근사표). 월주: 절기월 + 년간 규칙. 시주: 일간 + 시지 규칙.

export const STEMS = ['갑','을','병','정','무','기','경','신','임','계'];
export const BRANCHES = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
export const ELEMENTS = ['목','화','토','금','수'];

const STEM_EL = ['목','목','화','화','토','토','금','금','수','수'];
const BRANCH_EL = ['수','토','목','목','토','화','화','토','금','금','토','수'];

// 절기 근사(월지 경계일): [월, 일] — 인월 시작=입춘. 해마다 ±1일 오차 가능, 점심 앱 용도로 충분.
const TERMS = [[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7],[1,6]];

function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export function dayPillar(y, m, d) {
  const i = ((jdn(y, m, d) + 49) % 60 + 60) % 60;
  return { stem: i % 10, branch: i % 12 };
}

// 입춘 이전이면 전년도
function sajuYear(y, m, d) {
  return (m < 2 || (m === 2 && d < TERMS[0][1])) ? y - 1 : y;
}

export function yearPillar(y, m, d) {
  const sy = sajuYear(y, m, d);
  return { stem: ((sy - 4) % 10 + 10) % 10, branch: ((sy - 4) % 12 + 12) % 12 };
}

// 절기월 인덱스: 0=인월(입춘~) … 11=축월
function monthIndex(m, d) {
  for (let i = 11; i >= 0; i--) {
    const [tm, td] = TERMS[i];
    if (m > tm || (m === tm && d >= td)) return i === 11 && m === 1 ? 11 : i;
  }
  return 11; // 1월 소한 이후 또는 연초
}

export function monthPillar(y, m, d) {
  // 1월은 축월(전년 기준) 처리
  let mi;
  if (m === 1) mi = d >= TERMS[11][1] ? 11 : 10;
  else {
    mi = 10; // 기본: 아직 입춘 전이면 축월
    for (let i = 0; i < 11; i++) {
      const [tm, td] = TERMS[i];
      if (m > tm || (m === tm && d >= td)) mi = i;
    }
  }
  const ys = yearPillar(y, m, d).stem;
  // 갑기년→병인월 시작: 월간 = (년간%5)*2 + 2 + 월인덱스
  return { stem: ((ys % 5) * 2 + 2 + mi) % 10, branch: (mi + 2) % 12 };
}

export function hourPillar(dayStem, hour) {
  // 시지: 23~1시 자시 … 2시간 단위
  const hb = Math.floor(((hour + 1) % 24) / 2);
  return { stem: ((dayStem % 5) * 2 + hb) % 10, branch: hb };
}

// 생년월일(시) → 사주 요약
export function saju(y, m, d, hour = null) {
  const pillars = [yearPillar(y, m, d), monthPillar(y, m, d), dayPillar(y, m, d)];
  if (hour !== null && hour !== undefined && hour !== '') pillars.push(hourPillar(pillars[2].stem, +hour));
  const dist = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of pillars) { dist[STEM_EL[p.stem]]++; dist[BRANCH_EL[p.branch]]++; }
  const dayStem = pillars[2].stem;
  const sorted = ELEMENTS.slice().sort((a, b) => dist[a] - dist[b]);
  return {
    pillars,
    dayStem,
    dayEl: STEM_EL[dayStem],
    dist,
    lacking: sorted[0],            // 제일 부족한 오행 → 음식으로 보완
    excess: sorted[ELEMENTS.length - 1], // 제일 과한 오행
    ganji: pillars.map(p => STEMS[p.stem] + BRANCHES[p.branch]),
  };
}

// 재성 = 내(일간) 오행이 극하는 오행. 목극토 화극금 토극수 금극목 수극화
const CONQUERS = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };
export function wealthElement(dayStem) { return CONQUERS[STEM_EL[dayStem]]; }

// 오늘 일진 기준 재물운 점수: 오늘의 간지 오행 중 내 재성과 일치하는 개수 + 일간 합(오합) 보너스
export function wealthScore(mySaju, y, m, d) {
  const today = dayPillar(y, m, d);
  const w = wealthElement(mySaju.dayStem);
  let s = 0;
  if (STEM_EL[today.stem] === w) s += 3;
  if (BRANCH_EL[today.branch] === w) s += 3;
  if ((mySaju.dayStem + 5) % 10 === today.stem) s += 2; // 천간합
  s += mySaju.dist[w] || 0; // 원국에 재성이 많으면 기본 재물그릇
  return s;
}
