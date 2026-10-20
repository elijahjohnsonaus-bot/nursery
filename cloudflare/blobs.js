import { env } from 'cloudflare:workers';

// Stands in for @netlify/blobs (the build swaps this file in, see "alias" in wrangler.jsonc), so the functions
// in netlify/functions/ run on Cloudflare exactly as they are. It offers the few calls they use, backed by the
// Durable Object in store.js.

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesOf(data) {
  if (typeof data === 'string') return enc.encode(data).buffer;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  throw new TypeError('Unsupported value');
}

export function getStore(options) {
  const name = typeof options === 'string' ? options : options.name;
  // Created near Australia the first time it is used.
  const stub = () => env.STORE.getByName(name, { locationHint: 'oc' });

  // Reads made in the same moment (the settings function asks for a dozen keys at once) go as one call.
  let queue = null;
  function read(key) {
    return new Promise((resolve, reject) => {
      if (!queue) {
        const q = queue = { keys: [], waits: [] };
        Promise.resolve().then(async () => {
          queue = null;
          try {
            const got = await stub().getMany(q.keys);
            q.waits.forEach((w, i) => w.resolve(got[i]));
          } catch (e) { q.waits.forEach((w) => w.reject(e)); }
        });
      }
      queue.keys.push(key);
      queue.waits.push({ resolve, reject });
    });
  }

  return {
    async get(key, opts) {
      const buf = await read(key);
      if (buf == null) return null;
      const type = opts && opts.type;
      if (type === 'arrayBuffer') return buf;
      const text = dec.decode(buf);
      return type === 'json' ? JSON.parse(text) : text;
    },
    async set(key, data) { await stub().put(key, bytesOf(data)); },
    async setJSON(key, value) { await stub().put(key, enc.encode(JSON.stringify(value)).buffer); },
    async delete(key) { await stub().remove(key); },
    async list(opts) {
      const keys = await stub().keys((opts && opts.prefix) || '');
      return { blobs: keys.map((key) => ({ key, etag: '' })), directories: [] };
    },
  };
}
