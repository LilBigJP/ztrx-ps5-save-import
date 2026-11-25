// Build an Xbox (ztrx) story save container from a JSAV body + an Xbox template save.
// usage: node convert.js <body.jsav> <templateDir(v1)> <savesRoot> <containerName> <displayName> [ps5chives.dat]
const fs = require('fs'), path = require('path');
const { unpack, pack, lz4Decompress } = require('./asav.js');
const { sj } = require('./sjoaat.js');
const [bodyPath, tplDir, root, name, display, ps5] = process.argv.slice(2);

const body = fs.readFileSync(bodyPath);
if (body.toString('latin1', 0, 4) !== 'JSAV') throw new Error('body is not JSAV');
// template: a 0x170-byte Xbox ASAV header (header.bin), or a full Xbox save file named 0
const hdrFile = path.join(tplDir, 'header.bin');
const hdr = fs.existsSync(hdrFile) ? Buffer.from(fs.readFileSync(hdrFile).subarray(0, 0x170)) : Buffer.from(unpack(path.join(tplDir, '0')).hdr);
if (hdr.toString('latin1', 0, 4) !== 'ASAV' || hdr.length !== 0x170) throw new Error('bad template header');

// names: UTF-16 display at 0x28 (0x100 bytes), ASCII container at 0x128 (0x28 bytes)
hdr.fill(0, 0x28, 0x128); Buffer.from(display, 'utf16le').copy(hdr, 0x28, 0, 0xfe);
hdr.fill(0, 0x128, 0x150); Buffer.from(name, 'latin1').copy(hdr, 0x128, 0, 0x27);
hdr.writeUInt32LE(Math.floor(Date.now() / 1000), 0x20); // timestamp
if (ps5) { // slot info (completion %, etc.) from the PS5 header
  const raw = fs.readFileSync(ps5), at = raw.indexOf('ASAV', 0, 'latin1');
  if (at >= 0 && at < 0x100 && raw.length >= at + 0x170) raw.subarray(at, at + 0x170).copy(hdr, 0x154, 0x154, 0x160);
  else console.log('note: no ASAV header in', ps5, '- slot info (completion %) left at defaults');
}
const { f0, f1 } = pack(hdr, fs.readFileSync(path.join(tplDir, '1')), body);

// self-check: decode what we built
const tmp = path.join(require('os').tmpdir(), 'asav-check-0'); fs.writeFileSync(tmp, f0);
const back = unpack(tmp);
if (!back.body.equals(body) || !back.checks.asav) throw new Error('self-check failed');
if (f1.readUInt32LE(8) !== sj(f0)) throw new Error('file1 hash mismatch');

const hash = [...Buffer.from(name)].reduce((h, b) => BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n), 0xcbf29ce484222325n);
const dir = path.join(root, `${name}~${hash.toString(16).padStart(16, '0')}`, 'v1');
if (fs.existsSync(path.dirname(dir))) throw new Error('container already exists: ' + path.dirname(dir));
fs.mkdirSync(dir, { recursive: true });
const ls = s => { const b = Buffer.from(s); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
fs.writeFileSync(path.join(dir, '0'), f0);
fs.writeFileSync(path.join(dir, '1'), f1);
fs.writeFileSync(path.join(dir, 'manifest'), Buffer.concat([name, name, 'Save Game Data', 'Save Game Header'].map(ls)));
console.log('wrote', dir, 'data', f0.length, 'bytes (unpacked body', body.length, ')');
