import { getStore } from '@netlify/blobs';
import { refuse, reply } from '../lib/auth.js';

// Family photos for the nursery screen. They are added from the page at /photos.html (on a phone or
// laptop) and shown as a slideshow on the Echo.
//
// - Open unless NURSERY_PASSCODE is set in Netlify, which locks it (like everything else here). While it
//   is open anyone who has the site's address can see, add and delete photos. Kept in a private Netlify
//   Blobs store.
// - Only JPEG files are accepted (the page shrinks every photo and re-saves it as a JPEG, which also
//   drops the location and camera details that phone photos carry).
// - Each photo is two files: the photo itself (img/ID) and a small preview (thumb/ID).
// - The ID starts with the time it was added, so the list needs no extra bookkeeping.
//
//   GET    /api/photos                 the list, newest first: { photos: [{ id, at }] }
//   GET    /api/photos?id=ID[&thumb=1] the picture
//   POST   /api/photos?id=ID&kind=thumb|img   add one (the preview first, then the photo)
//   DELETE /api/photos?id=ID           remove both

const ID = /^[a-z0-9]{10,40}$/;
const MAX_PHOTOS = 300;
const LIMITS = { img: 2_500_000, thumb: 250_000 };

const store = () => getStore({ name: 'nursery-photos', consistency: 'strong' });
const isJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
// The first 8 characters of an ID are the time it was made, in base 36.
const addedAt = (id) => parseInt(id.slice(0, 8), 36) || 0;

export default async (req) => {
  const no = await refuse(req);
  if (no) return no;

  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const s = store();

  if (req.method === 'GET' && !id) {
    const { blobs } = await s.list({ prefix: 'img/' });
    const photos = blobs.map((b) => b.key.slice(4)).filter((x) => ID.test(x)).map((x) => ({ id: x, at: addedAt(x) }));
    photos.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
    return reply({ photos, now: Date.now() });
  }

  if (!ID.test(id)) return reply({ error: 'bad-id' }, 400);

  if (req.method === 'GET') {
    const data = await s.get((url.searchParams.get('thumb') ? 'thumb/' : 'img/') + id, { type: 'arrayBuffer' });
    if (!data) return reply({ error: 'not-found' }, 404);
    return new Response(data, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } });
  }

  if (req.method === 'POST') {
    const kind = url.searchParams.get('kind');
    if (!LIMITS[kind]) return reply({ error: 'bad-kind' }, 400);
    if (+req.headers.get('content-length') > LIMITS[kind]) return reply({ error: 'too-big' }, 413);
    const body = new Uint8Array(await req.arrayBuffer());
    if (body.length > LIMITS[kind]) return reply({ error: 'too-big' }, 413);
    if (!isJpeg(body)) return reply({ error: 'not-a-jpeg' }, 415);
    if (kind === 'img') {
      const { blobs } = await s.list({ prefix: 'img/' });
      if (blobs.length >= MAX_PHOTOS && !blobs.some((b) => b.key === 'img/' + id)) return reply({ error: 'full' }, 409);
    }
    await s.set(kind + '/' + id, body);
    return reply({ ok: true, id });
  }

  if (req.method === 'DELETE') {
    await s.delete('img/' + id);
    await s.delete('thumb/' + id);
    return reply({ ok: true });
  }

  return reply({ error: 'method' }, 405);
};

export const config = { path: '/api/photos' };
