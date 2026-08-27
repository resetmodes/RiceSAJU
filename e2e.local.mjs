// 로컬 e2e: mock Redis(Map) + http 서버로 api/team.js 실행. 배포 전 수동 확인용 (npm run e2e).
import http from 'node:http';
import { readFileSync } from 'node:fs';

// Upstash REST mock
const store = new Map(), hashes = new Map(), lists = new Map();
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const [cmd, ...a] = JSON.parse(b); let result = null;
    if (cmd === 'GET') result = store.get(a[0]) ?? null;
    if (cmd === 'SET') { store.set(a[0], a[1]); result = 'OK'; }
    if (cmd === 'HSET') { const h = hashes.get(a[0]) || new Map(); h.set(a[1], a[2]); hashes.set(a[0], h); result = 1; }
    if (cmd === 'HGETALL') { const h = hashes.get(a[0]); result = h ? [...h.entries()].flat() : []; }
    if (cmd === 'EXPIRE') result = 1;
    if (cmd === 'RPUSH') { const l = lists.get(a[0]) || []; l.push(a[1]); lists.set(a[0], l); result = l.length; }
    if (cmd === 'LRANGE') result = lists.get(a[0]) || [];
    res.end(JSON.stringify({ result }));
  });
});
await new Promise(z => mock.listen(0, z));
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${mock.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock';

const { default: handler } = await import('./api/team.js');

// Vercel req/res 흉내 + 정적 서빙
const app = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/team') {
    let b = ''; req.on('data', c => b += c); await new Promise(z => req.on('end', z));
    const vreq = { method: req.method, query: Object.fromEntries(u.searchParams), body: b ? JSON.parse(b) : {} };
    const vres = {
      status(c) { res.statusCode = c; return this; },
      json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); },
    };
    return handler(vreq, vres);
  }
  const f = u.pathname === '/' ? '/index.html' : u.pathname;
  try { res.end(readFileSync(new URL('./public' + f, import.meta.url))); }
  catch { res.statusCode = 404; res.end('404'); }
});
await new Promise(z => app.listen(3456, z));
console.log('e2e server: http://127.0.0.1:3456/#media-team');

if (process.argv.includes('--check')) {
  const api = (body) => fetch('http://127.0.0.1:3456/api/team' + (body ? '' : '?team=media-team'), body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team: 'media-team', ...body })
  } : undefined).then(r => r.json());
  await api({ action: 'join', name: '규빈', birth: { y: 1992, m: 3, d: 15, hour: 14 } });
  await api({ action: 'join', name: '승권', birth: { y: 1990, m: 11, d: 2 } });
  await api({ action: 'mood', name: '규빈', mood: '피곤' });
  await api({ action: 'mood', name: '승권', mood: '빡침' });
  const st = await api();
  const r = await api({ action: 'draw' });
  console.log('상태:', JSON.stringify(st));
  console.log('결과:', r.pick?.n, '/ 후보:', r.alts?.map(a => a.n).join(','), '/ 밥:', r.payer?.name);
  console.log('근거:', r.reasons?.join(' | '));
  const r2 = await api({ action: 'draw' });
  console.log('재뽑기 동일성:', r.pick.n === r2.pick.n ? 'OK(같음)' : 'FAIL');
  const rj1 = await api({ action: 'reject', place: r.pick.n });
  console.log('거스르기1:', rj1.pick?.n, '(거절수', rj1.rejects + ')');
  const rj2 = await api({ action: 'reject', place: rj1.pick.n });
  const rj3 = await api({ action: 'reject', place: rj2.pick.n });
  console.log('거스르기3:', rj3.pick?.n, '/ defy:', JSON.stringify(rj3.defy), '/ 금지:', rj3.avoid ? rj3.avoid.n : '없음(후보부족)', '/ 궁합:', JSON.stringify(rj3.match));

  process.exit(r.pick && r.payer && r.pick.n === r2.pick.n ? 0 : 1);
}
