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
//   POST /api/room   body { temp, hum }   ->  { ok: true }
//   GET  /api/room                        ->  { temp, hum, age }   (all null if the pod has never posted)

const KEY = 'latest.json';
const MAX_BODY = 1000;

const store = () => getStore({ name: 'nursery-room', consistency: 'strong' });
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export default async (req) => {
  const no = await refuse(req);
  if (no) return no;

  const s = store();

  if (req.method === 'GET') {
    const held = await s.get(KEY, { type: 'json' });
    if (!held || !isNum(held.temp, -40, 85) || !Number.isFinite(held.at)) return reply({ temp: null, hum: null, age: null });
    return reply({ temp: held.temp, hum: held.hum, age: Math.max(0, Date.now() - held.at) });
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

  if (!body || !isNum(body.temp, -40, 85)) return reply({ error: 'temp' }, 400);
  const hum = isNum(body.hum, 0, 100) ? Math.round(body.hum) : null;
  await s.setJSON(KEY, { temp: Math.round(body.temp * 10) / 10, hum, at: Date.now() });
  return reply({ ok: true });
};

export const config = { path: '/api/room' };
