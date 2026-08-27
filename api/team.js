// 팀 상태 API — Vercel Serverless Function. Upstash Redis REST를 fetch로 직접 호출(의존성 0).
// 환경변수: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, OPENWEATHER_KEY(선택)
import { recommend, MOODS } from '../lib/engine.js';
import { PLACES } from '../lib/places.js';

const TTL = 60 * 60 * 24 * 3; // 날짜 키 3일 자동 청소
const SAMSUNG = { lat: 37.5085, lon: 127.0637 }; // 현대백화점 본사(테헤란로98길) 인근

async function redis(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('no-redis');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

function todaySeoul() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, key: s };
}

// 팀코드 검증 — 키 인젝션 방지
function teamOf(q) {
  const t = String(q || '').trim().toLowerCase();
  return /^[a-z0-9-]{2,32}$/.test(t) ? t : null;
}

async function getWeather() {
  const key = process.env.OPENWEATHER_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${SAMSUNG.lat}&lon=${SAMSUNG.lon}&appid=${key}&units=metric`);
    if (!r.ok) return null;
    const w = await r.json();
    const t = w.main?.temp, rain = /rain|drizzle|snow|thunder/i.test(w.weather?.[0]?.main || '');
    if (rain) return { tag: '비', temp: t };
    if (t >= 27) return { tag: '더움', temp: t };
    if (t <= 8) return { tag: '추움', temp: t };
    return { tag: '선선', temp: t };
  } catch { return null; } // 날씨 실패는 침묵 폴백
}

export default async function handler(req, res) {
  try {
    const body = req.method === 'POST' ? (req.body || {}) : {};
    const team = teamOf(req.query?.team || body.team);
    if (!team) return res.status(400).json({ error: '팀 코드가 이상함' });
    const today = todaySeoul();
    const kMembers = `bapsaju:${team}:members`;
    const kDay = `bapsaju:${team}:${today.key}`;
    const kRecent = `bapsaju:${team}:recent`;
    const kStats = `bapsaju:${team}:stats:${today.key.slice(0, 7)}`; // 월간 전적
    const STATS_TTL = 60 * 60 * 24 * 40;

    if (req.method === 'POST' && body.action === 'join') {
      // 멤버 등록/수정: {name, birth:{y,m,d,hour?}}
      const { name, birth } = body;
      if (!name || !birth?.y || !birth?.m || !birth?.d) return res.status(400).json({ error: '이름이랑 생년월일은 있어야 함' });
      if (String(name).length > 12) return res.status(400).json({ error: '이름 12자까지' });
      const members = JSON.parse(await redis(['GET', kMembers]) || '{}');
      members[name] = { birth: { y: +birth.y, m: +birth.m, d: +birth.d, hour: birth.hour === '' || birth.hour == null ? null : +birth.hour } };
      await redis(['SET', kMembers, JSON.stringify(members)]);
      return res.json({ ok: true });
    }

    if (req.method === 'POST' && body.action === 'mood') {
      // 오늘 기분: {name, mood}
      const { name, mood } = body;
      if (!MOODS.includes(mood)) return res.status(400).json({ error: '그런 기분 없음' });
      const members = JSON.parse(await redis(['GET', kMembers]) || '{}');
      if (!members[name]) return res.status(400).json({ error: '먼저 등록부터' });
      await redis(['HSET', kDay, name, mood]);
      await redis(['EXPIRE', kDay, TTL]);
      return res.json({ ok: true });
    }

    if (req.method === 'POST' && body.action === 'reject') {
      // 운명 거스르기: 방금 나온 추천을 거절 목록에 쌓고 다시 뽑는다
      const kReject = `bapsaju:${team}:reject:${today.key}`;
      if (body.place) { await redis(['RPUSH', kReject, String(body.place).slice(0, 40)]); await redis(['EXPIRE', kReject, TTL]); }
      if (body.name) { await redis(['HINCRBY', kStats, `defy:${String(body.name).slice(0, 12)}`, '1']); await redis(['EXPIRE', kStats, String(STATS_TTL)]); }
      body.action = 'draw'; body._fromReject = true; // 아래 draw로 이어짐
    }

    if (req.method === 'POST' && body.action === 'draw') {
      // 새로 뽑는 거면(거스르기 아님) 오늘 거절 목록 리셋 — 파업 상태가 하루종일 안 가게
      if (!body._fromReject) await redis(['DEL', `bapsaju:${team}:reject:${today.key}`]);
      // 부적 뽑기: 오늘 기분 입력된 멤버 합산
      const members = JSON.parse(await redis(['GET', kMembers]) || '{}');
      const dayRaw = await redis(['HGETALL', kDay]) || [];
      const moods = {};
      for (let i = 0; i < dayRaw.length; i += 2) moods[dayRaw[i]] = dayRaw[i + 1];
      const active = Object.entries(moods)
        .filter(([name]) => members[name])
        .map(([name, mood]) => ({ name, mood, birth: members[name].birth }));
      if (!active.length) return res.status(400).json({ error: '아직 아무도 기분 입력 안 함' });
      const weather = await getWeather();
      const recent = JSON.parse(await redis(['GET', kRecent]) || '[]');
      const rejected = (await redis(['LRANGE', `bapsaju:${team}:reject:${today.key}`, '0', '-1'])) || [];
      const result = recommend(active, PLACES, {
        weather: weather?.tag || null,
        recent: recent.filter(r => r.date !== today.key).map(r => r.name),
        rejected,
        today,
      });
      // 뽑힌 곳 이력(3일치)
      const kept = recent.filter(r => r.date !== today.key).slice(-2);
      kept.push({ date: today.key, name: result.pick.n });
      await redis(['SET', kRecent, JSON.stringify(kept), 'EX', String(TTL)]);
      // 밥살 사람 월간 전적 — 같은 날 여러 번 뽑아도 1회만
      const first = await redis(['SET', `bapsaju:${team}:payday:${today.key}`, result.payer.name, 'NX', 'EX', String(TTL)]);
      if (first) { await redis(['HINCRBY', kStats, `pay:${result.payer.name}`, '1']); await redis(['EXPIRE', kStats, String(STATS_TTL)]); }
      return res.json({ ...result, weather, count: active.length, names: active.map(a => a.name), rejects: rejected.length });
    }

    // GET: 현재 상태 (멤버 목록 + 오늘 입력 현황)
    const members = JSON.parse(await redis(['GET', kMembers]) || '{}');
    const dayRaw = await redis(['HGETALL', kDay]) || [];
    const moods = {};
    for (let i = 0; i < dayRaw.length; i += 2) moods[dayRaw[i]] = dayRaw[i + 1];
    const statsRaw = await redis(['HGETALL', kStats]) || [];
    const stats = { pay: {}, defy: {} };
    for (let i = 0; i < statsRaw.length; i += 2) {
      const [kind, who] = statsRaw[i].split(':');
      if (stats[kind]) stats[kind][who] = +statsRaw[i + 1];
    }
    return res.json({ members: Object.keys(members), moods, today: today.key, stats });
  } catch (e) {
    if (e.message === 'no-redis') return res.status(500).json({ error: 'Redis 설정이 없음. README 보고 환경변수부터' });
    console.error(e);
    return res.status(500).json({ error: '뭔가 꼬임. 다시 눌러봐' });
  }
}
