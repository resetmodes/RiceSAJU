// 카카오 로컬 API — 본사 도보권 식당을 실시간으로 긁어온다. 의존성 0(fetch만).
// 환경변수: KAKAO_REST_KEY (없으면 lib/places.js 수기 목록으로 조용히 폴백)
// 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide

export const HQ = { lat: 37.5085, lon: 127.0637 }; // 현대백화점 본사(테헤란로98길) 인근
const RADIUS = 700;      // m — 도보 10분권
const WALK_MPM = 67;     // 분당 걷는 거리(m). 4km/h 기준

// 점심으로 안 치는 업종 — 술집·카페·제과는 FD6에 섞여 들어온다
const EXCLUDE = /술집|카페|커피|제과|베이커리|디저트|아이스크림|주점|호프|와인|칵테일|포장마차/;

// 카테고리·상호명 → 오행(e)/음식 결(m)/날씨(w)/가격대(p) 태깅.
// 위에서부터 먼저 맞는 규칙이 이긴다. 오행 기준은 lib/places.js 주석과 동일.
const RULES = [
  [/해장국|국밥|설렁탕|곰탕|삼계탕|추어탕|감자탕/, { e: ['토', '수'], m: ['해장', '든든', '아무'], w: ['추움', '비'], p: 2 }],
  [/부대찌개|김치찌개|찌개|전골/,                  { e: ['화', '토'], m: ['얼큰', '든든', '아무'], w: ['추움', '비'], p: 1 }],
  [/냉면|밀면/,                                    { e: ['수', '금'], m: ['가볍', '해장'], w: ['더움', '미세'], p: 2 }],
  [/막국수|메밀/,                                  { e: ['수', '목'], m: ['가볍', '새로'], w: ['더움'], p: 2 }],
  [/칼국수|수제비/,                                { e: ['금', '수'], m: ['든든', '해장'], w: ['추움', '비'], p: 1 }],
  [/쌀국수|베트남|태국|아시아|인도|커리|카레/,      { e: ['화', '목'], m: ['새로', '가볍'], w: ['더움', '선선'], p: 2 }],
  [/짬뽕|짜장|중식|중국/,                          { e: ['화', '수'], m: ['얼큰', '해장'], w: ['추움', '비'], p: 1 }],
  [/초밥|스시|롤|사시미|회|일식|이자카야/,          { e: ['수', '금'], m: ['가볍', '새로'], w: ['더움', '선선'], p: 3 }],
  [/돈까스|카츠|우동|소바|덮밥|규동/,               { e: ['금', '토'], m: ['든든', '새로'], w: ['비', '추움'], p: 2 }],
  [/곱창|막창|대창/,                               { e: ['화', '토'], m: ['든든', '얼큰'], w: ['추움', '선선'], p: 3 }],
  [/갈비|삼겹|고기|구이|스테이크|한우|정육|육류/,   { e: ['화', '토'], m: ['든든'], w: ['추움', '선선'], p: 3 }],
  [/파스타|피자|이탈리|양식|스파게티/,              { e: ['목', '화'], m: ['새로'], w: ['비', '선선'], p: 3 }],
  [/멕시칸|타코|브라질|스페인|그리스|터키/,         { e: ['화', '목'], m: ['새로'], w: ['더움', '선선'], p: 3 }],
  [/햄버거|버거|패스트푸드|샌드위치|토스트/,        { e: ['화', '금'], m: ['가볍', '아무'], w: ['더움', '미세'], p: 1 }],
  [/샐러드|포케|다이어트|비건|채식/,                { e: ['목', '수'], m: ['가볍', '새로'], w: ['더움', '미세'], p: 1 }],
  [/죽|이유식/,                                    { e: ['수', '토'], m: ['가볍', '해장'], w: ['추움', '비'], p: 1 }],
  [/분식|떡볶이|김밥/,                             { e: ['화', '토'], m: ['얼큰', '가볍', '아무'], w: ['추움', '비'], p: 1 }],
  [/쌈밥|보쌈|족발/,                               { e: ['목', '토'], m: ['가볍', '든든'], w: ['선선', '더움'], p: 2 }],
  [/해물|조개|굴|장어|생선|매운탕|아구/,            { e: ['수', '금'], m: ['얼큰', '든든'], w: ['추움', '비'], p: 3 }],
  [/닭|치킨|찜닭|닭갈비/,                          { e: ['화', '금'], m: ['든든', '얼큰'], w: ['선선', '추움'], p: 2 }],
  [/뷔페|한정식|백반|가정식/,                       { e: ['토', '목'], m: ['든든', '아무'], w: ['선선', '비'], p: 2 }],
  [/국수|면/,                                      { e: ['금', '수'], m: ['가볍', '해장'], w: ['비', '미세'], p: 1 }],
  [/한식/,                                         { e: ['토', '목'], m: ['든든', '아무'], w: ['선선', '추움'], p: 2 }],
];
const FALLBACK = { e: ['토'], m: ['아무'], w: ['선선'], p: 2 };

// 카테고리 마지막 조각을 메뉴 한 단어로 — "음식점 > 한식 > 육류,고기" → "육류"
export function menuWordOf(categoryName) {
  const last = String(categoryName || '').split('>').pop().trim();
  const word = last.split(',')[0].trim();
  return word && word !== '음식점' ? word : '밥';
}

// 상호명 + 카테고리를 합쳐 태깅한다. 상호에 메뉴가 드러나는 경우가 많아서 같이 본다.
export function tagPlace(placeName, categoryName) {
  const hay = `${categoryName || ''} ${placeName || ''}`;
  for (const [re, tag] of RULES) if (re.test(hay)) return tag;
  return FALLBACK;
}

// 카카오 문서 1건 → 우리 PLACES 스키마
export function toPlace(doc) {
  const tag = tagPlace(doc.place_name, doc.category_name);
  return {
    n: doc.place_name,
    c: menuWordOf(doc.category_name),
    e: tag.e, m: tag.m, w: tag.w, p: tag.p,
    d: Math.max(1, Math.round((+doc.distance || 0) / WALK_MPM)),
    note: doc.road_address_name || '',
    url: doc.place_url || '',
    src: 'kakao',
  };
}

// 반경 안 음식점(FD6)을 거리순으로 긁는다. 페이지당 15건 × 3페이지 = 최대 45곳.
export async function fetchPlaces(key, { lat = HQ.lat, lon = HQ.lon, radius = RADIUS } = {}) {
  if (!key) return null;
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://dapi.kakao.com/v2/local/search/category.json`
      + `?category_group_code=FD6&x=${lon}&y=${lat}&radius=${radius}&sort=distance&size=15&page=${page}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!r.ok) throw new Error('kakao ' + r.status);
    const j = await r.json();
    for (const doc of j.documents || []) {
      if (EXCLUDE.test(`${doc.category_name} ${doc.place_name}`)) continue;
      out.push(toPlace(doc));
    }
    if (j.meta?.is_end) break;
  }
  return out;
}

// 카카오 목록(실존 기준) + 수기 목록(사람이 쓴 메모·가격)을 합친다.
// 이름이 겹치면 카카오 쪽 좌표·거리를 쓰되 수기 메모와 가격대는 살린다.
export function mergePlaces(kakao, manual) {
  if (!kakao || !kakao.length) return manual;
  const byKey = n => String(n).replace(/\s|점$/g, '');
  const manualMap = new Map(manual.map(p => [byKey(p.n), p]));
  const merged = kakao.map(k => {
    const m = manualMap.get(byKey(k.n));
    return m ? { ...k, m: m.m, e: m.e, w: m.w, p: m.p, note: m.note } : k;
  });
  // 카카오가 못 잡은 수기 맛집(반경 밖 단골 등)도 남긴다
  const kakaoKeys = new Set(kakao.map(k => byKey(k.n)));
  for (const p of manual) if (!kakaoKeys.has(byKey(p.n))) merged.push(p);
  return merged;
}
