// The sample lecture has no microphone recording, so tap-ink-to-replay would
// have nothing to seek. This synthesizes a quiet placeholder track (a soft
// tick each second, a chime each 10 s) that matches the lecture timeline, so
// the replay flow is demoable offline. 8 kHz, 8-bit mono WAV.

export function synthesizeLectureAudio(durationSec: number): Blob {
  const rate = 8000;
  const n = Math.max(1, Math.ceil(durationSec * rate));
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const inSec = t % 1;
    const tenth = Math.floor(t) % 10 === 0;
    let s = 0;
    if (inSec < 0.04) s = Math.sin(2 * Math.PI * (tenth ? 880 : 440) * t) * (1 - inSec / 0.04) * (tenth ? 0.35 : 0.18);
    v.setUint8(44 + i, Math.round(128 + s * 127));
  }
  return new Blob([buf], { type: "audio/wav" });
}
