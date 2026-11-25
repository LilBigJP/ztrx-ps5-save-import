// Signed-byte seeded joaat as in game fn 0x4dd1900, verified against real Xbox save files.
const fs = require('fs');
const acc = (a, seed = 0) => { let h = seed >>> 0; for (const x of a) { const s = x >= 0x80 ? x - 256 : x; h = (h + s) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0; } return h; };
const fin = h => { h = Math.imul(h, 9) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0; return h >>> 0; };
const sj = (a, seed = 0) => fin(acc(a, seed));
module.exports = { sj };
if (require.main === module) {
  const hex = n => n.toString(16).padStart(8, '0');
  for (const dir of process.argv.slice(2)) {
    const d0 = fs.readFileSync(dir + '/0'), d1 = fs.readFileSync(dir + '/1');
    console.log('==', dir.split('/').slice(-2).join('/'));
    console.log(' data hash  file1[8]   =', hex(d1.readUInt32LE(8)), ' sj(file0) =', hex(sj(d0)));
    let h = sj(d1.subarray(0x10, 0x18)); h = sj(d1.subarray(0x24, 0x124), h); h = sj(d1.subarray(0x18, 0x1c), h); h = sj(d1.subarray(0x1c, 0x20), h); h = sj(d1.subarray(0x20, 0x24), h); h = sj(d1.subarray(0x8, 0xc), h);
    console.log(' hdr hash   file1[0xc] =', hex(d1.readUInt32LE(0xc)), ' chain     =', hex(h));
    const t = d0.readUInt32LE(0x160);
    const z = Buffer.from(d0); z.fill(0, 0x160, 0x164);
    const tries = { 'payload[0x170:]': d0.subarray(0x170), 'payload[0x168:]': d0.subarray(0x168), 'hdr[0:0x160]': d0.subarray(0, 0x160), 'hdr[8:0x160]': d0.subarray(8, 0x160), 'all cs0': z, '[0x164:]': d0.subarray(0x164) };
    for (const [n, b] of Object.entries(tries)) { const v = sj(b); if (v === t) console.log(' ASAV+0x160 HIT:', n); }
    console.log(' ASAV+0x160 target', hex(t));
  }
}
