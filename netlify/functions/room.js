import { getStore } from '@netlify/blobs';
import { refuse, reply } from '../lib/auth.js';

// The room sensor pod (an ESP32 with a temperature and humidity sensor) posts its reading here, and the
// screen reads it back. Only the latest reading is kept.
//
// - Open unless NURSERY_PASSCODE is set, like everything else here. If it is set, the pod sends it in an
//   x-nursery-pass header.
// - The reply says how old the reading is (`age`, in milliseconds, worked out here), so a device with a
//   wrong clock still knows whether the reading is fresh.
//
// - The screen can ask for a fresh reading right now (the "Check now" button). That leaves a request note that
//   lasts a minute or until the pod posts its next reading, whichever comes first. The pod finds the note by
//   asking GET /api/room?want=1 every few seconds, then reads its sensor and posts straight away.
//
//   POST /api/room   body { temp, hum }   ->  { ok: true }
//   POST /api/room   body { request: true } ->  { ok: true }   (the screen asking for a reading now)
//   GET  /api/room                        ->  { temp, hum, age, want }   (temp, hum and age are null if the pod has never posted)
//   GET  /api/room?want=1                 ->  { want }   (the small one the pod asks every few seconds)

const KEY = 'latest.json';
const WANT = 'want.json';          // { at } when the screen last asked for a reading
const WANT_FOR = 60 * 1000;        // a request is forgotten after a minute
const MAX_BODY = 1000;

const store = () => getStore({ name: 'nursery-room', consistency: 'strong' });
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export default async (req) => {
  const no = await refuse(req);
  if (no) return no;

  const s = store();

  if (req.method === 'GET') {
    const [held, asked] = await Promise.all([s.get(KEY, { type: 'json' }), s.get(WANT, { type: 'json' })]);
    const now = Date.now();
    const fresh = held && isNum(held.temp, -40, 85) && Number.isFinite(held.at);
    // Wanted while the request is recent and the pod has not posted anything since.
    const want = !!(asked && Number.isFinite(asked.at) && now - asked.at < WANT_FOR && (!fresh || held.at < asked.at));
    if (new URL(req.url).searchParams.has('want')) return reply({ want });
    if (!fresh) return reply({ temp: null, hum: null, age: null, want });
    return reply({ temp: held.temp, hum: held.hum, age: Math.max(0, now - held.at), want });
  }

  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return reply({ error: 'too-big' }, 413);
    body = JSON.parse(text);
  } catch {
    return reply({ error: 'bad-json' }, 400);
  }

  if (body && body.request === true) {
    await s.setJSON(WANT, { at: Date.now() });
    return reply({ ok: true });
  }

  if (!body || !isNum(body.temp, -40, 85)) return reply({ error: 'temp' }, 400);
  const hum = isNum(body.hum, 0, 100) ? Math.round(body.hum) : null;
  await s.setJSON(KEY, { temp: Math.round(body.temp * 10) / 10, hum, at: Date.now() });
  return reply({ ok: true });
};

export const config = { path: '/api/room' };
