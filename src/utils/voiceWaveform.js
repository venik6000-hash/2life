// Resample `samples` (number[]) into exactly `bars` peak values 0..255.
export function resampleWaveform(samples, bars = 32) {
  const out = new Uint8Array(bars);
  if (!samples || samples.length === 0) return out;
  if (samples.length === bars) {
    for (let i = 0; i < bars; i++) out[i] = clamp255(samples[i]);
    return out;
  }
  if (samples.length < bars) {
    // Upsample: nearest neighbour with peak hold.
    for (let i = 0; i < bars; i++) {
      const idx = Math.min(samples.length - 1, Math.floor((i / bars) * samples.length));
      out[i] = clamp255(samples[idx]);
    }
    return out;
  }
  // Downsample: take peak of each bucket.
  const bucket = samples.length / bars;
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.min(samples.length, Math.floor((i + 1) * bucket));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const v = clamp255(samples[j]);
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}

function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n || 0))); }

export function packWaveform(u8) {
  // base64 (browser btoa-compatible)
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  if (typeof btoa === "function") return btoa(s);
  return Buffer.from(u8).toString("base64");
}

export function unpackWaveform(b64) {
  if (!b64) return new Uint8Array(0);
  if (typeof atob === "function") {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}
