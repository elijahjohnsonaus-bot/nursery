import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

// Shared settings for the nursery screen, so the Echo, a laptop and a phone all agree.
//
// - Locked by the NURSERY_PASSCODE environment variable (set it in Netlify, then redeploy).
//   If it is not set, this refuses everyone. It is never left open.
// - Only the settings listed in RULES can be stored, and each must look right.
// - Every setting is kept on its own, with the time the server last saw it change. Two devices saving
//   different settings at the same moment therefore never overwrite each other, and two saving the same
//   one simply leaves the later save. Devices compare these server times only, so a wrong clock on one
//   device cannot cause trouble.

const MAX_BODY = 20000;

const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isNum = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const BAGS = ['0.2', '1.0', '2.5', '3.5'];

// What can be shared, and what each value has to look like.
export const RULES = {
  place: (v) => !!v && typeof v === 'object' && isStr(v.name, 120) && isNum(v.lat, 90) && isNum(v.lon, 180),
  nightFrom: (v) => typeof v === 'string' && HHMM.test(v),
  nightTo: (v) => typeof v === 'string' && HHMM.test(v),
  offset: (v) => isNum(v, 40),
  bags: (v) => !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).every((k) => BAGS.includes(k) && typeof v[k] === 'boolean') && Object.values(v).some(Boolean),
  'pip.host': (v) => isStr(v, 200),
  'pip.pass': (v) => isStr(v, 200),
  'pip.dob': (v) => v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)),
};

const blobKey = (k) => 'k/' + k;
const store = () => getStore({ name: 'nursery-settings', consistency: 'strong' });

// A stored entry is only believed if it still looks right.
function readEntry(k, e) {
  return e && typeof e === 'object' && Number.isFinite(e.at) && RULES[k](e.v) ? { v: e.v, at: e.at } : null;
}

async function readAll(s) {
  const found = await Promise.all(Object.keys(RULES).map(async (k) => [k, readEntry(k, await s.get(blobKey(k), { type: 'json' }))]));
  const keys = {};
  for (const [k, e] of found) if (e) keys[k] = e;
  return keys;
}

// Compare through a hash so the length of the passcode is not revealed either.
function samePasscode(given, expected) {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export default async (req) => {
  const expected = process.env.NURSERY_PASSCODE || '';
  if (!expected) return reply({ error: 'not-set-up' }, 503);
  if (!samePasscode(req.headers.get('x-nursery-pass') || '', expected)) {
    await sleep(500); // slows down guessing
    return reply({ error: 'passcode' }, 401);
  }

  const s = store();

  if (req.method === 'GET') return reply({ keys: await readAll(s), now: Date.now() });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return reply({ error: 'too-big' }, 413);
    body = JSON.parse(text);
  } catch {
    return reply({ error: 'bad-json' }, 400);
  }

  const changes = [];
  if (body && body.changes && typeof body.changes === 'object') {
    for (const [k, v] of Object.entries(body.changes)) {
      if (Object.prototype.hasOwnProperty.call(RULES, k) && RULES[k](v)) changes.push([k, v]);
    }
  }

  await Promise.all(changes.map(async ([k, v]) => {
    // Always later than what is there, so devices that already saw the old one notice the change.
    const held = readEntry(k, await s.get(blobKey(k), { type: 'json' }));
    await s.setJSON(blobKey(k), { v, at: Math.max(Date.now(), held ? held.at + 1 : 0) });
  }));

  return reply({ keys: await readAll(s), now: Date.now() });
};

export const config = { path: '/api/settings' };
