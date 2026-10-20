import { DurableObject } from 'cloudflare:workers';

// One of these holds one store's worth of data (the baby's entries, the shared settings, or the photos). It
// replaces Netlify Blobs: a small key-value store with strong consistency. A Durable Object handles one thing
// at a time and the storage calls below are held in order, so two phones saving at the same moment can't
// overwrite each other the way they could with an eventually consistent store.
//
// A value is kept whole in one row when it is under a megabyte. Bigger ones (a long history, a photo) are cut into
// pieces, because a single row can't be over 2 MB.

const INLINE = 1_000_000;
const BATCH = 100;

export class Store extends DurableObject {
  // Several values at once, in the order asked for. Missing ones come back as null.
  async getMany(keys) {
    const st = this.ctx.storage;
    const metas = await st.get(keys.map((k) => 'm/' + k));
    const out = [];
    for (const k of keys) {
      const meta = metas.get('m/' + k);
      if (!meta) { out.push(null); continue; }
      if (meta.data) { out.push(meta.data); continue; }
      const names = [];
      for (let i = 0; i < meta.n; i++) names.push('c/' + k + '/' + i);
      const whole = new Uint8Array(meta.size);
      let at = 0;
      for (let i = 0; i < names.length; i += BATCH) {
        const part = await st.get(names.slice(i, i + BATCH));
        for (const name of names.slice(i, i + BATCH)) {
          const piece = new Uint8Array(part.get(name));
          whole.set(piece, at); at += piece.length;
        }
      }
      out.push(whole.buffer);
    }
    return out;
  }

  async put(key, bytes) {
    const st = this.ctx.storage;
    const data = new Uint8Array(bytes);
    const old = await st.get('m/' + key);
    const rows = {};
    let n = 0;
    if (data.length <= INLINE) {
      rows['m/' + key] = { n: 0, size: data.length, data: data.slice().buffer };
    } else {
      n = Math.ceil(data.length / INLINE);
      for (let i = 0; i < n; i++) rows['c/' + key + '/' + i] = data.slice(i * INLINE, (i + 1) * INLINE).buffer;
      rows['m/' + key] = { n, size: data.length };
    }
    await st.put(rows);
    // Pieces left over from a longer earlier version.
    if (old && old.n > n) {
      const stale = [];
      for (let i = n; i < old.n; i++) stale.push('c/' + key + '/' + i);
      for (let i = 0; i < stale.length; i += BATCH) await st.delete(stale.slice(i, i + BATCH));
    }
  }

  async remove(key) {
    const st = this.ctx.storage;
    const old = await st.get('m/' + key);
    if (!old) return;
    const names = ['m/' + key];
    for (let i = 0; i < old.n; i++) names.push('c/' + key + '/' + i);
    for (let i = 0; i < names.length; i += BATCH) await st.delete(names.slice(i, i + BATCH));
  }

  async keys(prefix) {
    const found = await this.ctx.storage.list({ prefix: 'm/' + prefix });
    return [...found.keys()].map((k) => k.slice(2));
  }
}
