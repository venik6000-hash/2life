import assert from "node:assert/strict";
import { resampleWaveform, packWaveform, unpackWaveform } from "../src/utils/voiceWaveform.js";

// 1 — identity-ish case: 32 input → 32 bars
const arr1 = Array.from({ length: 32 }, (_, i) => i * 8);
const r1 = resampleWaveform(arr1, 32);
assert.equal(r1.length, 32);
assert.equal(r1[0], 0);
assert.equal(r1[31], 31 * 8);

// 2 — downsample: many samples → 32 bars, peak preserved
const arr2 = Array.from({ length: 1024 }, (_, i) => (i === 500 ? 255 : 10));
const r2 = resampleWaveform(arr2, 32);
assert.equal(r2.length, 32);
assert.ok(r2.some((v) => v >= 200), "peak preserved when downsampling");

// 3 — upsample: fewer than bars
const r3 = resampleWaveform([10, 200, 10], 32);
assert.equal(r3.length, 32);

// 4 — pack/unpack round-trip
const u8 = new Uint8Array(32).map((_, i) => (i * 7) & 0xff);
const packed = packWaveform(u8);
assert.equal(typeof packed, "string");
const unpacked = unpackWaveform(packed);
assert.equal(unpacked.length, 32);
for (let i = 0; i < 32; i++) assert.equal(unpacked[i], u8[i]);

console.log("voiceWaveform ok");
