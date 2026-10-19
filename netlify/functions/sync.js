import { getStore } from '@netlify/blobs';
import { refuse, reply } from '../lib/auth.js';

// The baby tracker's data (feeds, bottles, nappies, sleep, pumping, growth, medicine, notes), shared by
// the Echo, a laptop and every phone. This is the same sync protocol the Pip app used, so entries are
// moved over from Pip as they are and nothing about them changes.
//
// - Open unless NURSERY_PASSCODE is set in Netlify, which locks it (like everything else here).
// - Every entry has an id. An incoming entry wins only if it is strictly newer (its `updated` time) than
//   the copy held here, so sending the same entry twice is harmless and the newest edit wins.
// - The server numbers each change (`srv`). A device asks for everything after the last number it saw.
// - The device keeps an outbox and only clears an entry once the id comes back in `ack`, so nothing is
//   lost on a dropped connection.
//
//   GET  /api/sync?since=N      { seq, entries: [changed after N], ack: [] }
//   GET  /api/sync?health       { ok: true }
//   POST /api/sync              body { since, entries: [...] }  ->  { seq, entries, ack: [ids held] }

const KEY = 'state.json';
const MAX_ATTEMPTS = 4;
const MAX_BODY = 2_000_000;
const MAX_ENTRIES = 500;

const store = () => getStore({ name: 'baby-entries', consistency: 'strong' });

async function load(s) {
  const raw = await s.get(KEY, { type: 'json' });
  if (!raw || typeof raw !== 'object') return { entries: {}, seq: 0 };
  return { entries: raw.entries || {}, seq: raw.seq || 0 };
}

const newer = (incoming, existing) => !existing || (incoming.updated || 0) > (existing.updated || 0);

function sanitise(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (typeof e.id !== 'string' || e.id.length < 6 || e.id.length > 64) return null;
  if (typeof e.type !== 'string' || e.type.length > 24) return null;
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === 'srv') continue; // the server owns this field
    out[k] = typeof v === 'string' && v.length > 2000 ? v.slice(0, 2000) : v;
  }
  if (typeof out.updated !== 'number' || !Number.isFinite(out.updated)) out.updated = Date.now();
  return out;
}

export default async (req) => {
  const no = await refuse(req);
  if (no) return no;

  const s = store();

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('health') !== null) return reply({ ok: true });
    const since = Number(url.searchParams.get('since') || 0) || 0;
    const state = await load(s);
    const entries = Object.values(state.entries).filter((e) => (e.srv || 0) > since);
    return reply({ seq: state.seq, entries, ack: [] });
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

  const since = Number(body && body.since) || 0;
  const incoming = body && Array.isArray(body.entries) ? body.entries.map(sanitise).filter(Boolean).slice(0, MAX_ENTRIES) : [];

  let state;
  let ack = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    state = await load(s);
    let seq = state.seq;
    let changed = false;

    for (const entry of incoming) {
      if (newer(entry, state.entries[entry.id])) {
        state.entries[entry.id] = { ...entry, srv: ++seq };
        changed = true;
      }
    }

    if (changed) {
      state.seq = seq;
      await s.setJSON(KEY, state);
      // Read back: if a concurrent write clobbered this one, go round again. The device keeps anything
      // that isn't acknowledged in its outbox, so nothing is lost either way.
      const check = await load(s);
      const landed = incoming.every((e) => {
        const held = check.entries[e.id];
        return held && (held.updated || 0) >= (e.updated || 0);
      });
      if (!landed && attempt < MAX_ATTEMPTS) continue;
      state = check;
    }

    ack = incoming
      .filter((e) => {
        const held = state.entries[e.id];
        return held && (held.updated || 0) >= (e.updated || 0);
      })
      .map((e) => e.id);
    break;
  }

  const entries = Object.values(state.entries).filter((e) => (e.srv || 0) > since);
  return reply({ seq: state.seq, entries, ack });
};

export const config = { path: '/api/sync' };
