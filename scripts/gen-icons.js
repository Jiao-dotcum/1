// ============================================================
// gen-icons.js — generate Pixel Pal's app icons from the buddy sprite.
// Pure Node (zlib only), no dependencies. Run: node scripts/gen-icons.js
// Writes PNGs into ./icons.
// ============================================================
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// 16x16 buddy sprite (idle, eyes open, smiling) — matches app.js.
const SPRITE = [
  "______YY________",
  "______BB________",
  "______BB________",
  "____BBBBBB______",
  "___BPPPPPPB_____",
  "__BPLLLLLLPB____",
  "__BPWWPPWWPB____",
  "__BPWKPPWKPB____",
  "__BPPPPPPPPB____",
  "_BPCPPPPPPCPB___",
  "_BPPMMMMPPPPB___",
  "_BPPPPPPPPPPB___",
  "__BPPPPPPPPB____",
  "___BPP__PPB_____",
  "___BB____BB_____",
  "________________",
];
const PALETTE = {
  B: [26, 22, 64, 255],
  P: [123, 92, 255, 255],
  L: [169, 139, 255, 255],
  W: [255, 255, 255, 255],
  K: [16, 16, 36, 255],
  C: [0, 229, 192, 255],
  M: [255, 79, 154, 255],
  Y: [255, 210, 63, 255],
};
const BG = [27, 23, 70, 255]; // deep violet-navy

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function renderIcon(size, padFrac) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BG[0]; rgba[i * 4 + 1] = BG[1]; rgba[i * 4 + 2] = BG[2]; rgba[i * 4 + 3] = BG[3];
  }
  const inner = Math.floor(size * (1 - 2 * padFrac));
  const scale = Math.max(1, Math.floor(inner / 16));
  const off = Math.floor((size - scale * 16) / 2);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3];
  };
  for (let sy = 0; sy < 16; sy++) {
    for (let sx = 0; sx < 16; sx++) {
      const ch = SPRITE[sy][sx];
      const c = PALETTE[ch];
      if (!c) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          put(off + sx * scale + dx, off + sy * scale + dy, c);
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  ["icon-192.png", 192, 0.12],
  ["icon-512.png", 512, 0.12],
  ["icon-512-maskable.png", 512, 0.22], // extra padding for safe zone
  ["apple-touch-icon.png", 180, 0.1],
];
for (const [name, size, pad] of jobs) {
  fs.writeFileSync(path.join(outDir, name), renderIcon(size, pad));
  console.log("wrote icons/" + name + " (" + size + "x" + size + ")");
}
