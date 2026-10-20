import { refuse, reply } from '../netlify/lib/auth.js';
import sync from '../netlify/functions/sync.js';
import settings from '../netlify/functions/settings.js';
import photos from '../netlify/functions/photos.js';

// One-off: brings the baby's entries, the shared settings and the photos over from the old Netlify sites (the
// nursery app and/or the old Pip app) into this one. It runs on the server, so the old site doesn't need to allow
// other sites to read it. It only reads from the old site and never changes anything there. It is safe to
// run again: an entry that is already here is only replaced by a newer copy, and photos already here are skipped.
//
// It does nothing unless IMPORT_FROM is set in Cloudflare (Settings, Variables and secrets). One old site per
// line, as its address, optionally followed by | and its passcode if it has one:
//
//   https://nursery-old.netlify.app
//   https://pip-old.netlify.app|PIPPASSCODE
//
// Then open  https://YOUR-SITE/api/import  in a browser (add ?key=PASSCODE if this site has a passcode). It shows a
// page that keeps going by itself until everything is across (photos come over a few at a time) and says when it is done.
// Add &json=1 to see the raw answer instead. Delete IMPORT_FROM afterwards.
//
// Entries typed in by hand from photos of the Echo (ids starting photo-) while the old site was paused are tidied up at
// the end: when the real copy of one has come across (same kind, same minute) the photo copy is removed.
// A photo entry with no real match stays, so nothing is ever lost, and running the import again catches any that arrive later.

const CHUNK = 500;
const PHOTOS_PER_CALL = 5;   // a free Worker may only make about 50 outside calls per visit

function sources() {
  const out = [];
  for (const line of String(process.env.IMPORT_FROM || '').split(/[\n;]+/)) {
    const [raw, pass] = line.split('|').map((s) => s.trim());
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) out.push({ base: u.origin, pass: pass || '' });
    } catch { /* not an address */ }
  }
  return out;
}

// Worth trying again later (the old site is paused or unreachable), as opposed to the old site simply not having that part.
const transient = (e) => (e && e.status ? e.status >= 500 : !!e && (e.name === 'TimeoutError' || e.name === 'TypeError'));

const PAGE = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>Moving the nursery data</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:0 auto;padding:24px 16px}h1{font-size:1.3rem}
#log div{padding:6px 0;border-bottom:1px solid #8884}.ok{color:#1d7a3a;font-weight:600}.bad{color:#b3261e;font-weight:600}
button{font:inherit;padding:10px 18px;border-radius:10px;border:1px solid #8886;background:transparent;color:inherit;margin-top:14px}</style></head>
<body><h1>Moving the nursery data</h1><p id="now">Starting...</p><div id="log"></div><button id="again" hidden>Try again</button>
<script>
var log = document.getElementById('log'), now = document.getElementById('now'), again = document.getElementById('again');
var url = location.pathname + location.search + (location.search ? '&' : '?') + 'json=1';
function add(text, cls) { var d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text; log.appendChild(d); }
function stop(text, cls) { now.textContent = ''; add(text, cls); again.hidden = cls === 'ok'; }
function go(n) {
  now.textContent = 'Copying across (round ' + n + ')...';
  fetch(url, { cache: 'no-store' }).then(function (r) { return r.json().then(function (d) { return { r: r, d: d }; }); }).then(function (x) {
    var d = x.d;
    if (!x.r.ok) return stop(x.r.status === 401 ? 'This site has a passcode. Open this page again with ?key=YOUR-PASSCODE on the end.' : (d.hint || d.error || 'Something went wrong.'), 'bad');
    (d.sources || []).forEach(function (s) {
      var bits = [s.entries + ' entries', s.settings + ' settings', s.photos + ' photos this round'];
      if (s.photosLeft) bits.push(s.photosLeft + ' photos still to come');
      if (s.entriesError) bits.push('could not read the entries (' + s.entriesError + ')');
      if (s.photosError) bits.push('could not read the photos');
      if (s.settingsError) bits.push('could not read the settings');
      add(s.from + ': ' + bits.join(', '));
    });
    if (d.done) {
      if (d.removed) add('Removed ' + d.removed + ' entries that were typed in from photos, now that the real ones are here.');
      return stop('Done. Everything is across. You can delete IMPORT_FROM now.', 'ok');
    }
    if (d.problems) return stop('Some of it could not be read from the old site, so it is not finished. If the old site is still paused, try again once it is back.', 'bad');
    if (n >= 200) return stop('Stopped after 200 rounds. Open this page again to carry on.', 'bad');
    go(n + 1);
  }).catch(function () { stop('Could not reach this site. Check your connection and try again.', 'bad'); });
}
again.onclick = function () { log.textContent = ''; again.hidden = true; go(1); };
go(1);
</script></body></html>`;

const PHOTO = 'photo-';
const minuteKey = (e) => e.type + '|' + Math.floor(+e.start / 60000);   // who logged it is left out on purpose: the screen may say a different name than the photo did

async function dropPhotoDuplicates(self, mine, json) {
  const res = await sync(new Request(self + '/api/sync?since=0', { headers: mine }));
  if (!res.ok) return 0;
  const all = ((await res.json()).entries || []).filter((e) => e && +e.start);
  const spare = new Map();   // real copies in each minute that a photo entry has not already been matched with
  const count = (k, n) => spare.set(k, (spare.get(k) || 0) + n);
  for (const e of all) {
    if (!String(e.id).startsWith(PHOTO)) { if (!e.deleted) count(minuteKey(e), 1); }
    else if (e.deleted) count(minuteKey(e), -1);   // removed earlier, so it has used up a real copy already
  }
  const gone = [];
  for (const e of all) {
    if (e.deleted || !String(e.id).startsWith(PHOTO)) continue;
    const k = minuteKey(e);
    if ((spare.get(k) || 0) > 0) { count(k, -1); gone.push({ ...e, deleted: true, updated: Date.now() }); }
  }
  if (gone.length) await sync(new Request(self + '/api/sync', { method: 'POST', headers: json, body: JSON.stringify({ since: Number.MAX_SAFE_INTEGER, entries: gone }) }));
  return gone.length;
}

async function read(src, path, as = 'json') {
  const headers = src.pass ? { 'x-nursery-pass': src.pass, 'x-pip-pass': src.pass } : {};
  const res = await fetch(src.base + path, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Object.assign(new Error('http'), { status: res.status });
  return as === 'json' ? res.json() : res.arrayBuffer();
}

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const no = await refuse(key ? new Request(req.url, { headers: { 'x-nursery-pass': key } }) : req);
  if (no) return no;

  if (req.method === 'GET' && !url.searchParams.has('json') && /text\/html/.test(req.headers.get('accept') || '')) {
    return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  const list = sources();
  if (!list.length) return reply({ error: 'not-configured', hint: 'Set IMPORT_FROM in Cloudflare first (see the README).' }, 404);

  const self = url.origin;
  const mine = process.env.NURSERY_PASSCODE ? { 'x-nursery-pass': process.env.NURSERY_PASSCODE } : {};
  const json = { ...mine, 'content-type': 'application/json' };
  const post = (handler, path, body, headers = json) => handler(new Request(self + path, { method: 'POST', headers, body }));

  let budget = PHOTOS_PER_CALL;
  const report = [];
  for (const src of list) {
    const r = { from: src.base, entries: 0, settings: 0, photos: 0, photosLeft: 0 };
    try {
      const d = await read(src, '/api/sync?since=0');
      const entries = (d.entries || []).filter((e) => e && typeof e.id === 'string' && typeof e.type === 'string');
      for (let i = 0; i < entries.length; i += CHUNK) {
        const res = await post(sync, '/api/sync', JSON.stringify({ since: Number.MAX_SAFE_INTEGER, entries: entries.slice(i, i + CHUNK) }));
        if (!res.ok) throw Object.assign(new Error('own sync'), { status: res.status });
      }
      r.entries = entries.length;
    } catch (e) { r.entriesError = e.status ? 'http-' + e.status : String(e.name === 'TimeoutError' ? 'timeout' : e.message || e); }

    try {
      const d = await read(src, '/api/settings');
      const changes = {};
      for (const [k, e] of Object.entries(d.keys || {})) if (e && 'v' in e && k !== 'pip.pass') changes[k] = e.v;
      changes['pip.src'] = 'here';   // the baby's entries live in this app now
      const res = await post(settings, '/api/settings', JSON.stringify({ changes }));
      if (res.ok) r.settings = Object.keys(changes).length;
    } catch (e) { if (transient(e)) r.settingsError = true; /* otherwise the old Pip app has no shared settings */ }

    try {
      const theirs = ((await read(src, '/api/photos')).photos || []).map((p) => p.id);
      const have = new Set(((await (await photos(new Request(self + '/api/photos', { headers: mine }))).json()).photos || []).map((p) => p.id));
      const missing = theirs.filter((id) => !have.has(id));
      for (const id of missing) {
        if (budget <= 0) break;
        budget--;
        const thumb = await read(src, '/api/photos?id=' + id + '&thumb=1', 'bytes');
        const img = await read(src, '/api/photos?id=' + id, 'bytes');
        const h = { ...mine, 'content-type': 'image/jpeg' };
        await post(photos, '/api/photos?id=' + id + '&kind=thumb', thumb, h);
        const ok = await post(photos, '/api/photos?id=' + id + '&kind=img', img, h);
        if (ok.ok) r.photos++;
      }
      r.photosLeft = Math.max(0, missing.length - r.photos);
    } catch (e) { if (transient(e)) r.photosError = true; /* otherwise the old Pip app has no photos */ }
    report.push(r);
  }
  const left = report.reduce((n, r) => n + r.photosLeft, 0);
  const problems = report.some((r) => r.entriesError || r.photosError || r.settingsError);
  const done = left === 0 && !problems;
  let removed = 0;
  if (done) { try { removed = await dropPhotoDuplicates(self, mine, json); } catch { /* the copy itself is done; tidying can wait for next time */ } }
  return reply({ done, photosLeft: left || undefined, problems: problems || undefined, removed: removed || undefined, sources: report });
};
