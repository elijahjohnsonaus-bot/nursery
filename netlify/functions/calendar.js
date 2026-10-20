import { refuse, reply } from '../lib/auth.js';
import { parseEvents, trimFeed, expand, safeTz, zonedToUtc, zonedDate, dayNum, dayString } from '../lib/ical.js';

// The family calendar for the nursery screen.
//
// The calendars are Apple Calendar (or any other) shared links. Their addresses are kept only in the
// CALENDAR_FEEDS environment variable in Netlify, never in this repo or on a device. One per person, so
// each person gets their own colour:
//
//   CALENDAR_FEEDS = Elijah|#2E72B2|webcal://p12-caldav.icloud.com/published/2/AAAA
//                    Molly|#C2548A|webcal://p12-caldav.icloud.com/published/2/BBBB
//
// Separate people with a new line or a semicolon. The colour is optional (a person without one gets the
// next colour in the list below). CALENDAR_TZ sets the time zone (default Australia/Sydney).
// Like everything else here it is open unless NURSERY_PASSCODE is set in Netlify, which locks it. While it
// is open anyone who has the site's address can see the calendar.

const PALETTE = ['#2E72B2', '#C2548A', '#2D8251', '#B4621A', '#7A5BB5', '#1F8A8A'];
const MAX_FEED_BYTES = 3_000_000;
const MAX_EVENTS = 500;

function feeds() {
  const out = [];
  for (const entry of String(process.env.CALENDAR_FEEDS || '').split(/[\n;]+/)) {
    const raw = entry.trim();
    if (!raw) continue;
    const parts = raw.split('|').map((s) => s.trim());
    const url = parts[parts.length - 1].replace(/^webcals?:\/\//i, 'https://');
    let ok = false;
    try {
      const u = new URL(url);
      ok = u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
    } catch { /* not a link */ }
    if (!ok) continue;
    const colour = parts.length >= 3 && /^#[0-9a-f]{3,8}$/i.test(parts[1]) ? parts[1] : null;
    const name = (parts.length >= 2 ? parts[0] : '') || `Calendar ${out.length + 1}`;
    out.push({ name: name.slice(0, 40), color: colour || PALETTE[out.length % PALETTE.length], url });
  }
  return out;
}

// Google's calendar page links (calendar/u/0?cid=..., calendar/embed?src=..., calendar/r?cid=...) open a
// web page, not a calendar. The calendar file is the "Secret address in iCal format", under /calendar/ical/.
function isGooglePageLink(link) {
  const u = new URL(link);
  return /(^|\.)google\.com$/i.test(u.hostname) && /^\/calendar(\/|$)/i.test(u.pathname) && !/\/ical\//i.test(u.pathname);
}

async function readFeed(feed, win) {
  if (isGooglePageLink(feed.url)) throw Object.assign(new Error('page'), { code: 'wrong-link' });
  const res = await fetch(feed.url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'nursery-screen' } });
  if (!res.ok) throw Object.assign(new Error('http'), { code: 'http-' + res.status });
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw Object.assign(new Error('big'), { code: 'too-big' });
  if (!/BEGIN:VCALENDAR/i.test(text)) throw Object.assign(new Error('not a calendar'), { code: 'not-a-calendar' });
  return expand(parseEvents(trimFeed(text, win.fromDay, win.toDay)), win);
}

export default async (req) => {
  const no = await refuse(req);
  if (no) return no;
  if (req.method !== 'GET') return reply({ error: 'method' }, 405);

  const list = feeds();
  if (!list.length) return reply({ error: 'no-feeds' }, 503);

  const url = new URL(req.url);
  const days = Math.min(42, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 14));
  const tz = safeTz(process.env.CALENDAR_TZ, 'Australia/Sydney');
  const now = Date.now();
  const today = zonedDate(now, tz);
  const firstDay = dayNum(today.y, today.mo, today.d);
  const fromDay = dayString(firstDay), toDay = dayString(firstDay + days);
  const mid = (n) => { const [y, mo, d] = dayString(n).split('-').map(Number); return zonedToUtc(y, mo, d, 0, 0, 0, tz); };
  const win = { from: mid(firstDay), to: mid(firstDay + days), fromDay, toDay, tz };

  const results = await Promise.all(list.map(async (feed) => {
    try {
      const events = await readFeed(feed, win);
      return { feed, events };
    } catch (e) {
      return { feed, error: e && e.code ? e.code : (e && e.name === 'TimeoutError' ? 'timeout' : 'unreachable') };
    }
  }));

  const events = [];
  const feedInfo = results.map((r, i) => {
    if (!r.error) for (const e of r.events) events.push({ who: i, ...e });
    return { name: r.feed.name, color: r.feed.color, ok: !r.error, error: r.error || undefined, count: r.error ? 0 : r.events.length };
  });
  events.sort((a, b) => {
    const when = (o) => (o.allDay ? mid(dayNum(...o.day.split('-').map(Number))) : o.start);
    return when(a) - when(b) || (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || a.who - b.who;
  });
  return reply({ now, tz, from: fromDay, to: toDay, feeds: feedInfo, events: events.slice(0, MAX_EVENTS), truncated: events.length > MAX_EVENTS });
};

export const config = { path: '/api/calendar' };
