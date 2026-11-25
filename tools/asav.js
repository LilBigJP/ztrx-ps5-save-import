// ASAV (Xbox, v2) save tools: LZ4 block codec, checksums, unpack/pack.
const fs = require('fs');
const { sj } = require('./sjoaat.js');

function lz4Decompress(src, outSize) {
  const out = Buffer.alloc(outSize);
  let i = 0, o = 0;
  while (i < src.length) {
    const tok = src[i++];
    let lit = tok >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    src.copy(out, o, i, i + lit); i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2;
    let ml = tok & 15;
    if (ml === 15) { let b; do { b = src[i++]; ml += b; } while (b === 255); }
    ml += 4;
    if (off === 0 || off > o) throw new Error(`bad offset ${off} at out ${o}`);
    for (let k = 0; k < ml; k++, o++) out[o] = out[o - off];
  }
  if (o !== outSize) throw new Error(`decompressed ${o}, expected ${outSize}`);
  return out;
}

// Greedy hash-chain-free LZ4 block compressor (valid, decent ratio).
function lz4Compress(src) {
  const n = src.length, out = [];
  const HASH = 1 << 16, table = new Int32Array(HASH).fill(-1);
  const h4 = p => (Math.imul(src.readUInt32LE(p), 2654435761) >>> 16) & (HASH - 1);
  const pushLen = v => { while (v >= 255) { out.push(255); v -= 255; } out.push(v); };
  let anchor = 0, p = 0;
  const lastMatch = n - 12, endLit = n - 5;
  const emit = (litEnd, off, ml) => {
    const lit = litEnd - anchor;
    const tok = (Math.min(lit, 15) << 4) | (ml === null ? 0 : Math.min(ml - 4, 15));
    out.push(tok);
    if (lit >= 15) pushLen(lit - 15);
    for (let k = anchor; k < litEnd; k++) out.push(src[k]);
    if (ml !== null) { out.push(off & 255, off >> 8); if (ml - 4 >= 15) pushLen(ml - 4 - 15); }
  };
  while (p < lastMatch) {
    const h = h4(p), c = table[h]; table[h] = p;
    if (c >= 0 && p - c <= 65535 && src.readUInt32LE(c) === src.readUInt32LE(p)) {
      let ml = 4; while (p + ml < endLit && src[c + ml] === src[p + ml]) ml++;
      emit(p, p - c, ml); p += ml; anchor = p;
      if (p - 2 > 0 && p - 2 < lastMatch) table[h4(p - 2)] = p - 2;
    } else p++;
  }
  emit(n, 0, null);
  return Buffer.from(out);
}

function headerChecksum(hdr) { const b = Buffer.from(hdr.subarray(0, 0x170)); b.fill(0, 0x160, 0x164); return sj(b, 0x4bf672ed); }

function unpack(file0) {
  const b = fs.readFileSync(file0);
  if (b.toString('latin1', 0, 4) !== 'ASAV') throw new Error('not ASAV');
  const flags = b.readUInt32LE(0x10), packed = b.readUInt32LE(0x18), unpacked = b.readUInt32LE(0x1c);
  if (flags & 0x180) throw new Error('payload is encrypted (flags ' + flags.toString(16) + ')');
  const hdr = b.subarray(0, 0x170);
  const body = lz4Decompress(b.subarray(0x170, packed), unpacked - 0x170);
  return { hdr: Buffer.from(hdr), body, checks: { asav: headerChecksum(hdr) === b.readUInt32LE(0x160) } };
}

// Build file 0 (ASAV) and file 1 (Save Game Header) from a template header and a new JSAV body.
function pack(templateHdr, templateFile1, body) {
  const comp = lz4Compress(body);
  if (!lz4Decompress(comp, body.length).equals(body)) throw new Error('lz4 roundtrip failed');
  const hdr = Buffer.from(templateHdr);
  const total = 0x170 + comp.length;
  hdr.writeUInt32LE(0, 0x10);                 // flags: not encrypted
  hdr.writeUInt32LE(total, 0x18);             // packed size (whole file)
  hdr.writeUInt32LE(body.length + 0x170, 0x1c); // unpacked size (incl. header)
  hdr.writeUInt32LE(total, 0x168);            // size field next to the checksum
  hdr.writeUInt32LE(headerChecksum(hdr), 0x160);
  const f0 = Buffer.concat([hdr, comp]);
  const f1 = Buffer.from(templateFile1);
  hdr.copy(f1, 0x10, 0x20, 0x28);             // timestamp (as the game copies it)
  f1.writeUInt32LE(hdr.readUInt32LE(0x154), 0x18);
  f1.writeUInt32LE(total, 0x1c);              // packed size
  f1.writeUInt32LE(body.length + 0x170, 0x20); // unpacked size
  f1.fill(0, 0x24, 0x124); hdr.copy(f1, 0x24, 0x28, 0x128); // display name (UTF-16)
  f1.writeUInt32LE(f0.length, 4);             // data size
  f1.writeUInt32LE(sj(f0), 8);                // data hash
  let h = sj(f1.subarray(0x10, 0x18)); h = sj(f1.subarray(0x24, 0x124), h); h = sj(f1.subarray(0x18, 0x1c), h);
  h = sj(f1.subarray(0x1c, 0x20), h); h = sj(f1.subarray(0x20, 0x24), h); h = sj(f1.subarray(0x8, 0xc), h);
  f1.writeUInt32LE(h, 0xc);                   // header hash
  return { f0, f1 };
}

module.exports = { lz4Decompress, lz4Compress, unpack, pack, headerChecksum };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'unpack') { const r = unpack(a); fs.writeFileSync(b, r.body); console.log('ok', r.body.length, 'bytes, asav checksum', r.checks.asav); }
}
