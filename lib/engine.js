// 추천 엔진 — 순수 함수. Claude 호출 0, 외부 의존성 0.
import { saju, wealthScore, wealthElement, STEMS, BRANCHES, dayPillar } from './saju.js';

// 오늘의 진짜 기분(감정) → 음식 결 매핑. 식당 태그(m)는 음식 결 그대로 둔다.
export const MOODS = ['신남', '피곤', '빡침', '꿀꿀', '설렘', '무념', '현타', '텐션최고', '샤갈같음', '퇴사마려움', '월급루팡', '숙취'];
export const MOOD_MAP = {
  신남: ['새로', '든든'],
  피곤: ['든든', '해장'],
  빡침: ['얼큰'],
  꿀꿀: ['든든', '얼큰'],
  설렘: ['가볍', '새로'],
  무념: ['아무'],
  현타: ['든든', '얼큰'],       // 현실자각타임엔 뜨겁고 배부른 걸로 정신 붙잡기
  텐션최고: ['새로', '얼큰'],   // 텐션 높을 땐 자극적인 거나 안 가본 데
  샤갈같음: ['가볍', '새로'],   // 붕 떠 있는 몽환 상태. 맑고 낯선 게 어울림
  퇴사마려움: ['얼큰', '든든'], // 사표 쓰기 전에 일단 맵고 든든하게
  월급루팡: ['아무', '가볍'],   // 눈에 안 띄게 조용히 아무거나
  숙취: ['해장'],
};

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
export function recommend(members, places, { weather = null, recent = [], rejected = [], closed = [], today }) {
  const sajus = members.map(mb => ({
    ...mb,
    saju: saju(mb.birth.y, mb.birth.m, mb.birth.d, mb.birth.hour ?? null),
  }));
  const dateSeed = today.y * 10000 + today.m * 100 + today.d;

  // 없어졌다고 신고된 곳은 아예 후보에서 뺀다(복구 불가 제외).
  const alive = places.filter(p => !closed.includes(p.n));
  const live = alive.length ? alive : places;
  // 어제·그제 뽑힌 곳 + 오늘 거절한 곳은 후보에서 제외. 남는 게 없어지면 제외를 푼다.
  const banned = [...recent, ...rejected];
  const fresh = live.filter(p => !banned.includes(p.n));
  const pool = fresh.length >= 1 ? fresh : live;
  const defy = rejected.length >= 3; // 3회 거절 뒤부터는 사주·날씨를 버리고 기분만

  const scored = pool.map(p => {
    let score = 0;
    for (const mb of sajus) {
      if (!defy) {
        if (p.e.includes(mb.saju.lacking)) score += 3;   // 부족 오행을 채우는 음식
        if (p.e.includes(mb.saju.excess)) score -= 1;    // 과한 오행을 더 얹는 음식
      }
      if (mb.mood && (MOOD_MAP[mb.mood] || []).some(t => p.m.includes(t))) score += 4;
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
    fortunes: buildFortunes(sajus, today),
    todayGanji: ganjiOf(today),
    grade: buildGrade(scored[0].p, dateSeed, rejected.length),
    taboo: pickTaboo(dateSeed),
    peace: buildPeace(buildMatch(sajus), pool, dateSeed),
  };
}

// 부적 등급 — 뽑을 때마다 확률로 갈린다. 대길은 잘 안 나옴.
const GRADES = [
  { key: '대길', label: '大吉', chance: .07, line: '대길 부적이야!! 오늘은 후식까지 사주가 허락하겟습니다 습~ 꿀꺽' },
  { key: '길',   label: '吉',   chance: .28, line: '길한 부적이군. 무난하게 맛잇을 거야' },
  { key: '평',   label: '平',   chance: .50, line: '그냥 평범한 부적이야. 뭏론 그렇다고 나쁜 건 아니고' },
  { key: '흉',   label: '凶',   chance: 1,   line: '흉한 부적이 나왓어;; 계산할 때 지갑을 조심해' },
];
function buildGrade(pick, dateSeed, rejects) {
  const r = seedRand(dateSeed + rejects * 77, 'grade:' + pick.n);
  let acc = 0;
  for (const g of GRADES) { acc += g.chance; if (r < acc) return { key: g.key, label: g.label, line: g.line }; }
  return { key: '평', label: '平', line: GRADES[2].line };
}

// 오늘의 금기어 — 점심 자리에서 꺼내면 안 되는 말
const TABOOS = [
  ['다이어트', '재물운이 나가눈 거야'],
  ['어제 야근', '오후에 또 시킬 사람이 듣눈다'],
  ['다음 주 일정', '밥맛이 떨어지잖아'],
  ['운동 시작할 거야', '아무도 안 믿어'],
  ['이거 얼마야?', '계산할 사람 기분 상하겟군'],
  ['나 요즘 살쪘어', '상당히 뻔한 멘트야'],
  ['부장님이 그러눈데', '식탁에 상사를 올리지 마'],
  ['커피는 누가 사?', '지금 그 얘기를 왜 하노'],
];
export function pickTaboo(dateSeed) {
  const [word, why] = TABOOS[Math.floor(seedRand(dateSeed, 'taboo') * TABOOS.length)];
  return { word, why };
}

// 밥상극 두 사람을 위한 화해 메뉴 — 같이 나눠 먹눈 걸로 푼다
const PEACE_LINE = [
  '이거 하나 시켜서 같이 나눠 먹으면 풀리눈 거 아니노',
  '이거 앞에서는 싸울 수가 없어. 화해하면 되잖아',
  '둘이 이거 나눠 먹고 오해를 풀엇으면 좋겟군',
];
function buildPeace(match, pool, dateSeed) {
  if (!match || !match.worst || match.worst.s >= 0) return null;
  const share = pool.filter(p => p.m.includes('든든') || p.e.includes('토'));
  const cand = share.length ? share : pool;
  const menu = cand[Math.floor(seedRand(dateSeed, 'peace') * cand.length)];
  const line = PEACE_LINE[Math.floor(seedRand(dateSeed, 'pl') * PEACE_LINE.length)];
  return { a: match.worst.a, b: match.worst.b, n: menu.n, c: menu.c, line };
}

// 이/가 조사 — 받침 유무
const iga = w => { const c = w.charCodeAt(w.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0 ? '이' : '가'; };

// 오늘 여기 가면 안 됨: 점수 최하위 1곳 (정렬 반대편 끝이라 추천·후보와 겹칠 수 없음)
function buildAvoid(scored, sajus) {
  if (scored.length < 4) return null; // 후보가 적으면 금지까지 만들면 남는 게 없다
  const worst = scored[scored.length - 1].p;
  const clash = sajus.find(mb => worst.e.includes(mb.saju.excess));
  const why = clash
    ? `${clash.name} 사주에 ${clash.saju.excess} 기운이 이미 넘치눈데 ${worst.c}${iga(worst.c)} 그걸 더 얹잖아. 어이가 없다노!!`
    : '오늘 일진이랑 결이 안 맞눈 거야';
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

// 오늘의 사주 한 줄 — 내 일간과 오늘 일진의 십성 관계. 매일 바뀌고 사람마다 다르다.
const GEN = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' }; // 상생
const TEN_GODS = {
  비견: ['오늘은 다들 먹고 싶은 게 같아서 눈치싸움이 나겟군', '경쟁의 기운이야. 맛잇는 반찬은 먼저 집으면 되눈 거 아니노', '메뉴 통일하면 의외로 편하지 않겟습니까 습~ 꿀꺽', '옆자리랑 숟가락 속도가 겹치겟어. 마지막 만두를 조심해'],
  식신: ['먹복이 터진 날이야!! 오늘 뭘 먹어도 맛잇는 거 아니노', '먹복 만렙이군. 후식까지 가면 되눈 거야', '곱빼기를 시켜도 사주가 허락하겟습니다 습~ 꿀꺽', '오늘 네 입은 미슐랭 심사위원이야. 뭘 먹어도 정확하군'],
  재성: ['돈이 들어오눈 날이군. 근데 그 돈 점심값으로 나갈 운명이야', '오늘은 네가 계산하면 되눈 거 아니노?', '법인카드가 네 쪽으로 기울고 잇어', '지갑에 바람이 들엇군;; 더치페이를 먼저 외쳐'],
  관성: ['오후에 일이 터질 수 잇으니 든든하게 먹어둬야 하지 않겟어?', '윗사람 기운이 강한 날이군. 자리는 구석으로', '점심에 상사 마주칠 확률이 높아. 포커페이스를 준비해', '결재 기운이 감돌고 잇어. 밥이라도 든든해야 버티눈 거야'],
  인성: ['누가 사줄 수도 잇으니 지갑을 천천히 꺼내면 되눈 거 아니노', '배울 게 들어오눈 날이군. 새 메뉴에 도전하면 되잖아', '오늘은 얻어먹눈 그림이야. 사양은 금지야', '어른 기운이 널 감싸눈 날이군. 국물 잇는 걸로 대접받아'],
};
function tenGod(myEl, todayEl) {
  if (myEl === todayEl) return '비견';
  if (GEN[myEl] === todayEl) return '식신';
  if (CONQ[myEl] === todayEl) return '재성';
  if (CONQ[todayEl] === myEl) return '관성';
  return '인성';
}
// 부족 오행 → 점심 처방 한 줄
const EL_FOOD = {
  목: '채소나 새콤한 게 보약이야',
  화: '매운 거나 불맛으로 채우면 되눈 거 아니노',
  토: '밥·곡물·단맛이 약이군',
  금: '튀김이나 면 요리가 살길이야',
  수: '국물이랑 해산물로 보충하면 되잖아',
};
// 십성 용어를 풀어 쓴 라벨 — 화면에는 이걸 쓴다
const GOD_LABEL = { 비견: '메뉴 눈치싸움 기운', 식신: '먹복 터진 기운', 재성: '지갑 열리는 기운', 관성: '상사 주의보', 인성: '얻어먹을 기운' };
export function buildFortunes(sajus, today) {
  const t = dayPillar(today.y, today.m, today.d);
  const todayEl = STEM_EL_OF(t.stem);
  const dateSeed = today.y * 10000 + today.m * 100 + today.d;
  return sajus.map(mb => {
    const god = tenGod(STEM_EL_OF(mb.saju.dayStem), todayEl);
    const lines = TEN_GODS[god];
    const line = lines[Math.floor(seedRand(dateSeed, 'ft:' + mb.name) * lines.length)];
    // 밥운 별점(1~5): 십성 기본치 + 날짜 시드 흔들기. 같은 날 같은 사람은 고정.
    const base = { 식신: 4, 재성: 3, 인성: 3, 비견: 2, 관성: 2 }[god];
    const stars = Math.max(1, Math.min(5, base + Math.floor(seedRand(dateSeed, 'st:' + mb.name) * 3) - 1));
    return {
      name: mb.name,
      ilgan: STEMS[mb.saju.dayStem] + '(' + STEM_EL_OF(mb.saju.dayStem) + ')',
      god, godLabel: GOD_LABEL[god], line, stars,
      lacking: mb.saju.lacking,
      remedy: `${mb.saju.lacking} 기운이 비엇어. ${EL_FOOD[mb.saju.lacking]}`,
    };
  });
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
    r.push(`${helped.map(m => m.name).join('·')} 사주에 ${el} 기운이 없길래 ${p.c}(${p.e.join('·')})로 채웟어`);
  }
  const moodHit = sajus.filter(mb => mb.mood && (MOOD_MAP[mb.mood] || []).some(t => p.m.includes(t)));
  if (moodHit.length) r.push(`오늘 기붕 "${moodHit[0].mood}"이 ${moodHit.length}명이라 이쪽으로 갓어`);
  if (weather && p.w.includes(weather)) r.push(`지금 본사 날씨(${weather})랑 딱 맞눈 거 아니노`);
  if (!r.length) r.push('오늘 일진이 그냥 여기래. 뭏론 그렇다고');
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
    reason: `오늘따라 ${w.name}한테 돈 들어올 기운이 제일 세눈 거 아니노. 지갑 열 운명이야!! 소문낼 거야`,
    ranking: ranked.map(r => ({ name: r.name, score: Math.round(r.score * 10) / 10 })),
  };
}
