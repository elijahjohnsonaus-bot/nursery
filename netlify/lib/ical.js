// A small reader for iCalendar (.ics) feeds, enough for Apple Calendar shared links:
// timed and all-day events, time zones (TZID), repeating events (RRULE with EXDATE, RDATE and moved
// instances), cancelled events and folded or escaped text. It reads one feed and lists what falls inside
// a window of days. It does not need a network or any package.

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_MS = 86400000;

// Windows time zone names some calendar programs write, mapped to Australian zones.
const WINDOWS_ZONES = {
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tasmania Standard Time': 'Australia/Hobart',
  'UTC': 'UTC',
};

// ------------------------------------------------------------------ time zones
const formatters = new Map();
function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

// A zone name that this runtime knows, or the fallback.
export function safeTz(tz, fallback) {
  const name = WINDOWS_ZONES[tz] || tz;
  if (!name) return fallback;
  try { formatter(name); return name; } catch { return fallback; }
}

// How far ahead of UTC the zone is at a given moment, in milliseconds.
function offsetAt(tz, utcMs) {
  const p = {};
  for (const x of formatter(tz).formatToParts(new Date(utcMs))) p[x.type] = +x.value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

// The moment (UTC milliseconds) when a wall clock in the zone showed this date and time.
export function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = naive - offsetAt(tz, naive);
  return naive - offsetAt(tz, first);
}

// The calendar date in the zone at a given moment.
export function zonedDate(utcMs, tz) {
  const p = {};
  for (const x of formatter(tz).formatToParts(new Date(utcMs))) p[x.type] = +x.value;
  return { y: p.year, mo: p.month, d: p.day };
}

export const dayNum = (y, mo, d) => Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS);
export function fromDayNum(n) { const t = new Date(n * DAY_MS); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
const pad = (n) => String(n).padStart(2, '0');
export const dayString = (n) => { const { y, mo, d } = fromDayNum(n); return `${y}-${pad(mo)}-${pad(d)}`; };
const weekdayOf = (n) => (((n + 4) % 7) + 7) % 7; // 0 = Sunday
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

// ------------------------------------------------------------------ reading the text
function unfold(text) {
  const out = [];
  for (const raw of String(text).split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

function parseLine(line) {
  let colon = -1, quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon), value = line.slice(colon + 1);
  const parts = [];
  let cur = '', q = false;
  for (const c of head) {
    if (c === '"') { q = !q; cur += c; } else if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  const name = parts.shift().toUpperCase();
  const params = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

const unescapeText = (s) => String(s).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function parseDate(value, params) {
  const v = String(value).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { allDay: true, y: +m[1], mo: +m[2], d: +m[3] };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (m) return { allDay: false, y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +m[6], z: m[7] === 'Z', tz: (params && params.TZID) || null };
  return null;
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY_MS + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseRule(value) {
  const rule = { freq: '', interval: 1, count: 0, until: null, byday: [], bymonthday: [], bymonth: [], wkst: 'MO' };
  for (const part of String(value).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).toUpperCase(), v = part.slice(eq + 1);
    if (k === 'FREQ') rule.freq = v.toUpperCase();
    else if (k === 'INTERVAL') rule.interval = Math.max(1, parseInt(v, 10) || 1);
    else if (k === 'COUNT') rule.count = Math.max(0, parseInt(v, 10) || 0);
    else if (k === 'UNTIL') rule.until = parseDate(v, null);
    else if (k === 'WKST') rule.wkst = v.toUpperCase();
    else if (k === 'BYDAY') {
      for (const x of v.split(',')) {
        const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim());
        if (m) rule.byday.push({ n: m[1] ? parseInt(m[1], 10) : 0, wd: WEEKDAYS.indexOf(m[2].toUpperCase()) });
      }
    } else if (k === 'BYMONTHDAY') rule.bymonthday = v.split(',').map((x) => parseInt(x, 10)).filter((x) => x && Math.abs(x) <= 31);
    else if (k === 'BYMONTH') rule.bymonth = v.split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 12);
  }
  return ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.freq) ? rule : null;
}

function toEvent(raw) {
  const get = (n) => raw.props.find((p) => p.name === n);
  const all = (n) => raw.props.filter((p) => p.name === n);
  const ds = get('DTSTART');
  if (!ds) return null;
  const start = parseDate(ds.value, ds.params);
  if (!start) return null;
  const de = get('DTEND'), dur = get('DURATION'), rr = get('RRULE'), rid = get('RECURRENCE-ID');
  const ev = {
    uid: (get('UID') || {}).value || '',
    title: unescapeText((get('SUMMARY') || {}).value || '').trim(),
    where: unescapeText((get('LOCATION') || {}).value || '').trim(),
    cancelled: ((get('STATUS') || {}).value || '').toUpperCase() === 'CANCELLED',
    start,
    end: de ? parseDate(de.value, de.params) : null,
    durationMs: dur ? parseDuration(dur.value) : null,
    rule: rr ? parseRule(rr.value) : null,
    exdates: [], rdates: [],
    recurrenceId: rid ? parseDate(rid.value, rid.params) : null,
  };
  for (const p of all('EXDATE')) for (const v of p.value.split(',')) { const d = parseDate(v, p.params); if (d) ev.exdates.push(d); }
  for (const p of all('RDATE')) for (const v of p.value.split(',')) { const d = parseDate(v.split('/')[0], p.params); if (d) ev.rdates.push(d); }
  return ev;
}

// All the events in the text, as written (repeating ones are not expanded yet).
export function parseEvents(text) {
  const events = [];
  let cur = null, depth = 0;
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      if (!cur && p.value.toUpperCase() === 'VEVENT') { cur = { props: [] }; depth = 0; } else if (cur) depth++;
    } else if (p.name === 'END') {
      if (!cur) continue;
      if (depth > 0) depth--; else if (p.value.toUpperCase() === 'VEVENT') { events.push(cur); cur = null; }
    } else if (cur && depth === 0) cur.props.push(p);
  }
  return events.map(toEvent).filter(Boolean);
}

// ------------------------------------------------------------------ repeating events
function monthDays(y, mo, rule, startDay) {
  // Days in one month that the rule picks (as day numbers), in order.
  const dim = daysInMonth(y, mo), first = dayNum(y, mo, 1), out = [];
  if (rule.byday.length) {
    for (const { n, wd } of rule.byday) {
      const matches = [];
      for (let d = 1; d <= dim; d++) if (weekdayOf(first + d - 1) === wd) matches.push(first + d - 1);
      if (!n) out.push(...matches);
      else { const pick = n > 0 ? matches[n - 1] : matches[matches.length + n]; if (pick !== undefined) out.push(pick); }
    }
    if (rule.bymonthday.length) {
      const want = new Set(rule.bymonthday.map((x) => (x > 0 ? x : dim + 1 + x)));
      return out.filter((n) => want.has(fromDayNum(n).d)).sort((a, b) => a - b);
    }
  } else if (rule.bymonthday.length) {
    for (const x of rule.bymonthday) { const d = x > 0 ? x : dim + 1 + x; if (d >= 1 && d <= dim) out.push(first + d - 1); }
  } else {
    const d = fromDayNum(startDay).d;
    if (d <= dim) out.push(first + d - 1);
  }
  return out.sort((a, b) => a - b);
}

// Day numbers on which a repeating event starts, from its first day, in order, up to lastDay.
// firstNeeded lets daily and weekly rules without a COUNT skip ahead.
function ruleDays(startDay, rule, firstNeeded, lastDay) {
  const out = [];
  const start = fromDayNum(startDay);
  const wkst = Math.max(0, WEEKDAYS.indexOf(rule.wkst));
  const byMonth = rule.bymonth.length ? new Set(rule.bymonth) : null;
  const byDayWd = rule.byday.length ? new Set(rule.byday.map((x) => x.wd)) : null;
  let seen = 0;
  // Returns false when the series is over (count reached or past lastDay).
  const take = (day) => {
    if (day < startDay) return true;
    if (day > lastDay) return false;
    seen++;
    if (rule.count && seen > rule.count) return false;
    if (day >= firstNeeded) out.push(day);
    return true;
  };
  for (let k = 0; k < 20000; k++) {
    let days = [];
    let periodStart;
    if (rule.freq === 'DAILY') {
      if (!rule.count && k === 0) k = Math.max(0, Math.floor((firstNeeded - startDay) / rule.interval) - 1);
      const day = startDay + k * rule.interval;
      periodStart = day;
      if ((!byDayWd || byDayWd.has(weekdayOf(day))) && (!byMonth || byMonth.has(fromDayNum(day).mo))
        && (!rule.bymonthday.length || rule.bymonthday.includes(fromDayNum(day).d))) days = [day];
    } else if (rule.freq === 'WEEKLY') {
      const base0 = startDay - ((weekdayOf(startDay) - wkst + 7) % 7);
      if (!rule.count && k === 0) k = Math.max(0, Math.floor((firstNeeded - base0) / (7 * rule.interval)) - 1);
      const base = base0 + 7 * rule.interval * k;
      periodStart = base;
      const wds = rule.byday.length ? [...new Set(rule.byday.map((x) => x.wd))] : [weekdayOf(startDay)];
      days = wds.map((wd) => base + ((wd - wkst + 7) % 7)).sort((a, b) => a - b);
      if (byMonth) days = days.filter((d) => byMonth.has(fromDayNum(d).mo));
    } else if (rule.freq === 'MONTHLY') {
      const m = start.y * 12 + (start.mo - 1) + k * rule.interval;
      const y = Math.floor(m / 12), mo = (m % 12) + 1;
      periodStart = dayNum(y, mo, 1);
      if (!byMonth || byMonth.has(mo)) days = monthDays(y, mo, rule, startDay);
    } else {
      const y = start.y + k * rule.interval;
      periodStart = dayNum(y, 1, 1);
      const months = rule.bymonth.length ? [...rule.bymonth].sort((a, b) => a - b) : [start.mo];
      for (const mo of months) days.push(...monthDays(y, mo, rule, startDay));
    }
    if (periodStart > lastDay) break;
    for (const day of days) if (!take(day)) return out;
  }
  return out;
}

// The time of day of an occurrence, on a given date, as UTC milliseconds.
function occurrenceStart(master, day, defaultTz) {
  const s = master.start, { y, mo, d } = fromDayNum(day);
  if (s.z) return Date.UTC(y, mo - 1, d, s.h, s.mi, s.s);
  return zonedToUtc(y, mo, d, s.h, s.mi, s.s, safeTz(s.tz, defaultTz));
}
function toUtc(dt, defaultTz) {
  if (dt.z) return Date.UTC(dt.y, dt.mo - 1, dt.d, dt.h, dt.mi, dt.s);
  return zonedToUtc(dt.y, dt.mo, dt.d, dt.h, dt.mi, dt.s, safeTz(dt.tz, defaultTz));
}
// How an occurrence is recognised when something refers to it (EXDATE, RECURRENCE-ID).
function keyOf(dt, defaultTz) { return dt.allDay ? dayString(dayNum(dt.y, dt.mo, dt.d)) : String(toUtc(dt, defaultTz)); }

// What lies inside the window. opts: { from, to (UTC ms), fromDay, toDay ('YYYY-MM-DD', to is exclusive), tz }.
// Timed events come back as { title, where, start, end } and all-day ones as { title, where, allDay, day, endDay }.
export function expand(events, opts) {
  const { from, to, fromDay, toDay } = opts;
  const tz = safeTz(opts.tz, 'UTC');
  const lo = dayNum(...fromDay.split('-').map(Number)) - 2, hi = dayNum(...toDay.split('-').map(Number)) + 2;
  const moved = new Map(); // uid -> keys of instances that were changed or removed on their own
  for (const e of events) {
    if (!e.recurrenceId) continue;
    if (!moved.has(e.uid)) moved.set(e.uid, new Set());
    moved.get(e.uid).add(keyOf(e.recurrenceId, tz));
  }
  const out = [];
  const add = (e, startDay, startMs) => {
    if (e.start.allDay) {
      let days = 1;
      if (e.end && e.end.allDay) days = Math.max(1, dayNum(e.end.y, e.end.mo, e.end.d) - dayNum(e.start.y, e.start.mo, e.start.d));
      else if (e.durationMs) days = Math.max(1, Math.ceil(e.durationMs / DAY_MS));
      const day = dayString(startDay), endDay = dayString(startDay + days);
      if (endDay > fromDay && day < toDay) out.push({ title: e.title, where: e.where, allDay: true, day, endDay, uid: e.uid });
    } else {
      let len = 0;
      if (e.end) len = Math.max(0, toUtc(e.end, tz) - toUtc(e.start, tz));
      else if (e.durationMs) len = Math.max(0, e.durationMs);
      const end = startMs + len;
      if ((end > from && startMs < to) || (len === 0 && startMs >= from && startMs < to)) out.push({ title: e.title, where: e.where, start: startMs, end, uid: e.uid });
    }
  };
  for (const e of events) {
    if (e.cancelled) continue;
    const startDay = dayNum(e.start.y, e.start.mo, e.start.d);
    if (!e.rule) {
      add(e, startDay, e.start.allDay ? 0 : toUtc(e.start, tz));
      continue;
    }
    const skip = new Set((moved.get(e.uid) || []));
    for (const x of e.exdates) skip.add(keyOf(x, tz));
    const untilMs = e.rule.until && !e.rule.until.allDay ? toUtc(e.rule.until, tz) : null;
    const untilDay = e.rule.until && e.rule.until.allDay ? dayNum(e.rule.until.y, e.rule.until.mo, e.rule.until.d) : null;
    const days = ruleDays(startDay, e.rule, lo, untilDay !== null ? Math.min(hi, untilDay) : hi);
    const extra = e.rdates.map((r) => ({ day: dayNum(r.y, r.mo, r.d), ms: r.allDay ? 0 : toUtc(r, tz) }));
    for (const day of days) {
      const ms = e.start.allDay ? 0 : occurrenceStart(e, day, tz);
      if (untilMs !== null && ms > untilMs) break;
      const key = e.start.allDay ? dayString(day) : String(ms);
      if (!skip.has(key)) add(e, day, ms);
    }
    for (const r of extra) {
      const key = e.start.allDay ? dayString(r.day) : String(r.ms);
      if (!skip.has(key)) add(e, r.day, e.start.allDay ? 0 : (r.ms || occurrenceStart(e, r.day, tz)));
    }
  }
  // In order of when they start (all-day ones at the start of their day).
  const when = (o) => {
    if (!o.allDay) return o.start;
    const [y, mo, d] = o.day.split('-').map(Number);
    return zonedToUtc(y, mo, d, 0, 0, 0, tz);
  };
  return out.sort((a, b) => when(a) - when(b) || (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0));
}
