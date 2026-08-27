// 추천 엔진 — 순수 함수. Claude 호출 0, 외부 의존성 0.
import { saju, wealthScore, wealthElement, STEMS, BRANCHES, dayPillar } from './saju.js';

export const MOODS = ['든든', '가볍', '얼큰', '해장', '새로', '아무'];

// 날짜+문자열 시드 의사난수 (0~1). 같은 날 같은 입력이면 항상 같은 결과 — 조작 시비 방지.
function seedRand(seed, str) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 2654435761); }
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1000) / 1000;
}

// members: [{name, birth:{y,m,d,hour?}, mood}]
// places: [{n,c,e,m,w,p,d,note}] (lib/places.js)
// weather: '더움'|'추움'|'비'|'미세'|'선선'|null, recent: 최근 뽑힌 식당 이름들
// rejected: 오늘 "운명 거스르기"로 거절한 식당 이름들 — 후보에서 빠지고, 4회째부터는 사주를 버린다
export function recommend(members, places, { weather = null, recent = [], rejected = [], today }) {
  const sajus = members.map(mb => ({
    ...mb,
    saju: saju(mb.birth.y, mb.birth.m, mb.birth.d, mb.birth.hour ?? null),
  }));
  const dateSeed = today.y * 10000 + today.m * 100 + today.d;

  // 어제·그제 뽑힌 곳 + 오늘 거절한 곳은 후보에서 제외. 남는 게 없어지면 제외를 푼다.
  const banned = [...recent, ...rejected];
  const fresh = places.filter(p => !banned.includes(p.n));
  const pool = fresh.length >= 1 ? fresh : places;
  const defy = rejected.length >= 3; // 3회 거절 뒤부터는 사주·날씨를 버리고 기분만

  const scored = pool.map(p => {
    let score = 0;
    for (const mb of sajus) {
      if (!defy) {
        if (p.e.includes(mb.saju.lacking)) score += 3;   // 부족 오행을 채우는 음식
        if (p.e.includes(mb.saju.excess)) score -= 1;    // 과한 오행을 더 얹는 음식
      }
      if (mb.mood && p.m.includes(mb.mood)) score += 4;
    }
    if (!defy && weather && p.w.includes(weather)) score += 2 * members.length;
    if (banned.includes(p.n)) score -= 5;              // 제외가 풀렸을 때의 감점 폴백
    score += seedRand(dateSeed + rejected.length, p.n) * 0.99; // 동점 셔플(하루+회차 고정)
    return { p, score };
  }).sort((a, b) => b.score - a.score);

  return {
    pick: scored[0].p,
    alts: scored.slice(1, 3).map(s => s.p),
    reasons: defy ? [] : buildReasons(scored[0].p, sajus, weather),
    avoid: buildAvoid(scored, sajus),
    match: buildMatch(sajus),
    defy: defy ? { category: scored[0].p.c } : null,
    payer: pickPayer(sajus, today),
    todayGanji: ganjiOf(today),
  };
}

// 이/가 조사 — 받침 유무
const iga = w => { const c = w.charCodeAt(w.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0 ? '이' : '가'; };

// 오늘 여기 가면 안 됨: 점수 최하위 1곳 (정렬 반대편 끝이라 추천·후보와 겹칠 수 없음)
function buildAvoid(scored, sajus) {
  if (scored.length < 4) return null; // 후보가 적으면 금지까지 만들면 남는 게 없다
  const worst = scored[scored.length - 1].p;
  const clash = sajus.find(mb => worst.e.includes(mb.saju.excess));
  const why = clash
    ? `${clash.name} 사주에 ${clash.saju.excess} 기운이 이미 넘치는데 ${worst.c}${iga(worst.c)} 그걸 더 얹잖아`
    : '오늘 일진이랑 결이 안 맞아';
  return { n: worst.n, c: worst.c, why };
}

// 밥궁합/밥상극: 일간 기준 쌍 점수 — 천간합 +5, 같은 오행 +2, 상극(극하거나 극당함) -3
const STEM_EL_OF = s => ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'][s];
const CONQ = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };
function pairScore(a, b) {
  const ea = STEM_EL_OF(a), eb = STEM_EL_OF(b);
  let s = 0;
  if ((a + 5) % 10 === b || (b + 5) % 10 === a) s += 5; // 천간합
  if (ea === eb) s += 2;
  if (CONQ[ea] === eb || CONQ[eb] === ea) s -= 3;
  return s;
}

export function buildMatch(sajus) {
  if (sajus.length < 2) return null;
  const pairs = [];
  for (let i = 0; i < sajus.length; i++) for (let j = i + 1; j < sajus.length; j++) {
    pairs.push({ a: sajus[i].name, b: sajus[j].name, s: pairScore(sajus[i].saju.dayStem, sajus[j].saju.dayStem) });
  }
  pairs.sort((x, y) => y.s - x.s);
  const best = pairs[0], worst = pairs[pairs.length - 1];
  if (best === worst) return best.s >= 0 ? { best, worst: null } : { best: null, worst };
  return { best, worst };
}

function ganjiOf(today) {
  const dp = dayPillar(today.y, today.m, today.d);
  return STEMS[dp.stem] + BRANCHES[dp.branch];
}

// 결과 부적에 싣는 근거 — 대충 쓴 메모톤.
function buildReasons(p, sajus, weather) {
  const r = [];
  const helped = sajus.filter(mb => p.e.includes(mb.saju.lacking));
  if (helped.length) {
    const el = helped[0].saju.lacking;
    r.push(`${helped.map(m => m.name).join('·')} 사주에 ${el} 기운이 없는데 ${p.c}(${p.e.join('·')})로 채웠어`);
  }
  const moodHit = sajus.filter(mb => mb.mood && p.m.includes(mb.mood));
  if (moodHit.length) r.push(`오늘 기분 "${moodHit[0].mood}"${iga(moodHit[0].mood)} ${moodHit.length}표니까 반영했어`);
  if (weather && p.w.includes(weather)) r.push(`지금 삼성동 날씨(${weather})랑 딱이야`);
  if (!r.length) r.push('오늘 일진이 그냥 여기래 근데');
  return r;
}

// 오늘 밥살 사람: 일진 대비 재물운 점수 1위. 동점이면 날짜 시드로.
export function pickPayer(sajus, today) {
  const dateSeed = today.y * 10000 + today.m * 100 + today.d;
  const ranked = sajus.map(mb => ({
    name: mb.name,
    score: wealthScore(mb.saju, today.y, today.m, today.d) + seedRand(dateSeed, 'pay:' + mb.name) * 0.5,
    wEl: wealthElement(mb.saju.dayStem),
  })).sort((a, b) => b.score - a.score);
  const w = ranked[0];
  return {
    name: w.name,
    reason: `오늘 ${ganjiOf(today)}일인데 ${w.name} 재성(${w.wEl})이 최고조야. 지갑 열 운명이야!! 소문낼거야`,
    ranking: ranked.map(r => ({ name: r.name, score: Math.round(r.score * 10) / 10 })),
  };
}
