import { getStore } from '@netlify/blobs';
import { refuse, reply, isOpen } from '../lib/auth.js';

// Shared settings for the nursery screen, so the Echo, a laptop and a phone all agree.
//
// - Open by default, so any device that opens the site shares the same settings with nothing to enter.
//   Set NURSERY_PASSCODE in Netlify (then redeploy) to lock it. While it is open the Pip passcode is
//   never stored or returned here. A locked site shares it too.
// - Only the settings listed in RULES can be stored, and each must look right.
// - Every setting is kept on its own, with the time the server last saw it change. Two devices saving
//   different settings at the same moment therefore never overwrite each other, and two saving the same
//   one simply leaves the later save. Devices compare these server times only, so a wrong clock on one
//   device cannot cause trouble.

const MAX_BODY = 20000;

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isNum = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const BAGS = ['0.2', '1.0', '2.5', '3.5'];
const FRAME_IDLE = [0, 2, 5, 10, 30];   // no longer used by the app (the full-screen frame is manual now); kept so an older cached page can still save
const SLIDE_SECS = [5, 10, 20, 30, 60];   // seconds each photo stays up in the slideshow

// What can be shared, and what each value has to look like.
export const RULES = {
  place: (v) => !!v && typeof v === 'object' && isStr(v.name, 120) && isNum(v.lat, 90) && isNum(v.lon, 180),
  nightFrom: (v) => typeof v === 'string' && HHMM.test(v),
  nightTo: (v) => typeof v === 'string' && HHMM.test(v),
  offset: (v) => isNum(v, 40),
  frameIdle: (v) => FRAME_IDLE.includes(v),
  slideSecs: (v) => SLIDE_SECS.includes(v),
  bags: (v) => !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).every((k) => BAGS.includes(k) && typeof v[k] === 'boolean') && Object.values(v).some(Boolean),
  'pip.host': (v) => isStr(v, 200),
  'pip.pass': (v) => isStr(v, 200),
  'pip.dob': (v) => v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)),
  // Where the baby's entries live: this site ('here') or the old Pip app ('old'). Left unset it follows
  // whether an old Pip address has been typed in.
  'pip.src': (v) => v === 'old' || v === 'here',
  'pip.baby': (v) => isStr(v, 40),
  'pip.wet': (v) => Number.isInteger(v) && v >= 0 && v <= 20,
  'pip.dirty': (v) => Number.isInteger(v) && v >= 0 && v <= 20,
  'pip.guide': (v) => typeof v === 'boolean',
};

const blobKey = (k) => 'k/' + k;
const store = () => getStore({ name: 'nursery-settings', consistency: 'strong' });

// A stored entry is only believed if it still looks right.
function readEntry(k, e) {
  return e && typeof e === 'object' && Number.isFinite(e.at) && RULES[k](e.v) ? { v: e.v, at: e.at } : null;
}

// What can be shared right now.
const shared = (open) => Object.keys(RULES).filter((k) => !(open && k === 'pip.pass'));

async function readAll(s, open) {
  const found = await Promise.all(shared(open).map(async (k) => [k, readEntry(k, await s.get(blobKey(k), { type: 'json' }))]));
  const keys = {};
  for (const [k, e] of found) if (e) keys[k] = e;
  return keys;
}

export default async (req) => {
  const no = await refuse(req);
  if (no) return no;

  const s = store();
  const open = isOpen();

  if (req.method === 'GET') return reply({ keys: await readAll(s, open), open, now: Date.now() });
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
      if (shared(open).includes(k) && RULES[k](v)) changes.push([k, v]);
    }
  }

  await Promise.all(changes.map(async ([k, v]) => {
    // Always later than what is there, so devices that already saw the old one notice the change.
    const held = readEntry(k, await s.get(blobKey(k), { type: 'json' }));
    await s.setJSON(blobKey(k), { v, at: Math.max(Date.now(), held ? held.at + 1 : 0) });
  }));

  return reply({ keys: await readAll(s, open), open, now: Date.now() });
};

export const config = { path: '/api/settings' };
