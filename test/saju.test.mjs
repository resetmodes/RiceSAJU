import { test } from 'node:test';
import assert from 'node:assert';
import { dayPillar, saju, wealthElement, STEMS, BRANCHES } from '../lib/saju.js';
import { recommend, pickPayer } from '../lib/engine.js';
import { PLACES } from '../lib/places.js';

const g = p => STEMS[p.stem] + BRANCHES[p.branch];

test('일주 앵커 — 만세력 대조값', () => {
  assert.equal(g(dayPillar(1900, 1, 1)), '갑술');
  assert.equal(g(dayPillar(2000, 1, 1)), '무오');
  assert.equal(g(dayPillar(2024, 1, 1)), '갑자'); // 2024-01-01 = 갑자일 (만세력 대조)
});

test('년주 — 입춘 경계', () => {
  const s1 = saju(1992, 1, 20); // 입춘 전 → 1991 신미년
  assert.equal(STEMS[s1.pillars[0].stem] + BRANCHES[s1.pillars[0].branch], '신미');
  const s2 = saju(1992, 3, 15); // 임신년
  assert.equal(STEMS[s2.pillars[0].stem] + BRANCHES[s2.pillars[0].branch], '임신');
});

test('시주 생략 가능', () => {
  const a = saju(1992, 3, 15);
  assert.equal(a.pillars.length, 3);
  const b = saju(1992, 3, 15, 14);
  assert.equal(b.pillars.length, 4);
});

test('오행 분포 합계 = 기둥 수 × 2', () => {
  const s = saju(1988, 7, 7, 9);
  const sum = Object.values(s.dist).reduce((a, b) => a + b, 0);
  assert.equal(sum, 8);
});

test('재성 상극 규칙', () => {
  assert.equal(wealthElement(0), '토'); // 갑(목) → 목극토
  assert.equal(wealthElement(2), '금'); // 병(화) → 화극금
  assert.equal(wealthElement(8), '화'); // 임(수) → 수극화
});

const members = [
  { name: '규빈', birth: { y: 1992, m: 3, d: 15 }, mood: '든든' },
  { name: '승권', birth: { y: 1990, m: 11, d: 2 }, mood: '얼큰' },
  { name: '디전', birth: { y: 1995, m: 6, d: 21 }, mood: '가볍' },
];
const today = { y: 2026, m: 8, d: 27 };

test('추천 — 1곳 + 후보 2곳, 근거 있음', () => {
  const r = recommend(members, PLACES, { weather: '더움', recent: [], today });
  assert.ok(r.pick.n);
  assert.equal(r.alts.length, 2);
  assert.ok(r.reasons.length >= 1);
  assert.ok(!r.alts.map(a => a.n).includes(r.pick.n));
});

test('추천 — 같은 날 같은 입력이면 결과 동일 (조작 시비 방지)', () => {
  const a = recommend(members, PLACES, { weather: null, recent: [], today });
  const b = recommend(members, PLACES, { weather: null, recent: [], today });
  assert.equal(a.pick.n, b.pick.n);
  assert.equal(a.payer.name, b.payer.name);
});

test('추천 — 연속 방지: 어제 뽑힌 곳은 밀린다', () => {
  const base = recommend(members, PLACES, { weather: null, recent: [], today });
  const again = recommend(members, PLACES, { weather: null, recent: [base.pick.n], today });
  assert.notEqual(again.pick.n, base.pick.n);
});

test('밥살 사람 — 전원 랭킹 포함, 날이 바뀌면 바뀔 수 있는 구조', () => {
  const r = recommend(members, PLACES, { weather: null, recent: [], today });
  assert.equal(r.payer.ranking.length, 3);
  assert.ok(members.some(m => m.name === r.payer.name));
  assert.ok(r.payer.reason.includes(r.payer.name));
});

test('금지 식당 — 추천·후보와 겹치지 않는다', () => {
  const r = recommend(members, PLACES, { weather: null, recent: [], today });
  assert.ok(r.avoid, '후보 6곳이면 금지가 나온다');
  assert.notEqual(r.avoid.n, r.pick.n);
  assert.ok(!r.alts.map(a => a.n).includes(r.avoid.n));
});

test('밥궁합/밥상극 — 2명 이상이면 쌍이 나온다', () => {
  const r = recommend(members, PLACES, { weather: null, recent: [], today });
  assert.ok(r.match.best || r.match.worst);
  const solo = recommend([members[0]], PLACES, { weather: null, recent: [], today });
  assert.equal(solo.match, null);
});

test('운명 거스르기 — 거절한 곳은 다시 안 나오고, 3회부터 defy 모드', () => {
  const r0 = recommend(members, PLACES, { weather: null, recent: [], today });
  const r1 = recommend(members, PLACES, { weather: null, recent: [], rejected: [r0.pick.n], today });
  assert.notEqual(r1.pick.n, r0.pick.n);
  assert.equal(r1.defy, null);
  const rejected3 = [r0.pick.n, r1.pick.n, 'x'];
  const r3 = recommend(members, PLACES, { weather: null, recent: [], rejected: rejected3, today });
  assert.ok(r3.defy, '3회 거절이면 defy');
  assert.equal(r3.defy.category, r3.pick.c);
  assert.ok(!rejected3.includes(r3.pick.n));
  assert.equal(r3.reasons.length, 0);
});
