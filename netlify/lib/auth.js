import { createHash, timingSafeEqual } from 'node:crypto';

// The nursery passcode check shared by every function.
//
// By default the site is open, like the Pip app: anyone who has the address can use it, and every screen
// that opens it shares the same settings with nothing to enter. To lock it, set NURSERY_PASSCODE in Netlify
// (then redeploy). From then on each device must send that passcode, which it does once from a
// #key=PASSCODE link or from Settings.

export const jsonHeaders = { 'content-type': 'application/json', 'cache-control': 'no-store' };
export const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Compare through a hash so the length of the passcode is not revealed either.
function samePasscode(given, expected) {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// True when no passcode is set, so the site is open.
export const isOpen = () => !process.env.NURSERY_PASSCODE;

// Returns a Response to send back when the request must not go on, or null when it may.
export async function refuse(req) {
  const expected = process.env.NURSERY_PASSCODE || '';
  if (!expected) return null;
  if (!samePasscode(req.headers.get('x-nursery-pass') || '', expected)) {
    await sleep(500); // slows down guessing
    return reply({ error: 'passcode' }, 401);
  }
  return null;
}
