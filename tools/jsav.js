// JSAV body: header (magic, ver 3, codeCount, totalCount), index of {hash,1,0,offset,size} x total,
// padding to the JSON document {"CodeSaveBlocks":[...],"ScriptSaveBlocks":[...]} + NUL padding.
const fs = require('fs'), path = require('path');

function read(buf) {
  if (buf.toString('latin1', 0, 4) !== 'JSAV') throw new Error('not JSAV');
  const ver = buf.readUInt32LE(4), code = buf.readUInt32LE(8), scripts = buf.readUInt32LE(12), total = code + scripts;
  const blocks = [];
  for (let i = 0; i < total; i++) {
    const o = 0x10 + i * 20;
    const hash = buf.readUInt32LE(o), a = buf.readUInt32LE(o + 4), b = buf.readUInt32LE(o + 8), off = buf.readUInt32LE(o + 12), size = buf.readUInt32LE(o + 16);
    blocks.push({ i, hash, a, b, off, size, text: buf.subarray(off, off + size).toString('utf8'), script: i >= code });
  }
  return { ver, code, total, blocks, buf };
}

// Rebuild with the same index/JSON framing as the game: '{"CodeSaveBlocks":[\r\n' b0 ',\r\n' b1 ... ']\r\n,"ScriptSaveBlocks":[\r\n' ...
function write(j) {
  const orig = j.buf;
  const first = j.blocks.reduce((m, x) => Math.min(m, x.off), Infinity);
  const docStart = orig.indexOf('{"CodeSaveBlocks"', 0, 'latin1');
  const head = Buffer.from(orig.subarray(0, docStart));         // header + index + padding
  const sorted = [...j.blocks].sort((a, c) => a.off - c.off);
  const parts = [], newOff = new Map();
  let cur = docStart, prevEnd = docStart;
  // keep exactly the original separator bytes between blocks
  let pos = docStart;
  for (const blk of sorted) {
    const sep = orig.subarray(pos === docStart ? docStart : pos, blk.off);
    parts.push(sep); cur += sep.length;
    const t = Buffer.from(blk.text, 'utf8');
    newOff.set(blk.i, [cur, t.length]); parts.push(t); cur += t.length;
    pos = blk.off + blk.size;
  }
  const tail = orig.subarray(pos); // closing brackets + the game's own NUL padding, kept as-is
  parts.push(tail); cur += tail.length;
  const body = Buffer.concat([head, ...parts]);
  for (const blk of j.blocks) { const [o, s] = newOff.get(blk.i); const at = 0x10 + blk.i * 20; body.writeUInt32LE(o, at + 12); body.writeUInt32LE(s, at + 16); }
  // sanity: whole document must parse and each indexed slice must parse
  JSON.parse(body.subarray(docStart).toString('utf8').replace(/\0+$/, ''));
  for (const blk of j.blocks) { const at = 0x10 + blk.i * 20; JSON.parse(body.subarray(body.readUInt32LE(at + 12), body.readUInt32LE(at + 12) + body.readUInt32LE(at + 16)).toString('utf8')); }
  return body;
}

module.exports = { read, write };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'split') {
    const j = read(fs.readFileSync(a)); fs.mkdirSync(b, { recursive: true });
    for (const blk of j.blocks) fs.writeFileSync(path.join(b, `${String(blk.i).padStart(2, '0')}_${blk.script ? 's' : 'c'}_0x${blk.hash.toString(16).padStart(8, '0')}.json`), JSON.stringify(JSON.parse(blk.text), null, 1));
    console.log(`code ${j.code}, total ${j.total}`);
    for (const blk of j.blocks) console.log(String(blk.i).padStart(2), blk.script ? 'S' : 'C', '0x' + blk.hash.toString(16).padStart(8, '0'), String(blk.size).padStart(7), blk.text.slice(0, 90).replace(/\s+/g, ' '));
  }
  if (cmd === 'roundtrip') { const buf = fs.readFileSync(a); const out = write(read(buf)); console.log('identical:', out.equals(buf), out.length, buf.length); if (!out.equals(buf)) { let k = 0; while (out[k] === buf[k]) k++; console.log('first diff at', k.toString(16), JSON.stringify(buf.subarray(k - 10, k + 20).toString('latin1')), JSON.stringify(out.subarray(k - 10, k + 20).toString('latin1'))); } }
}
