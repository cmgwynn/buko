// Synthesizes Buko's original rest-timer cue (two soft sine tones) as 16-bit mono PCM WAV.
// No recorded or third-party audio is used. Re-run with: node scripts/generate-workout-cue.mjs
import { writeFileSync } from 'node:fs';

const rate = 22050;
const tones = [
  { freq: 880, start: 0, length: 0.16 },
  { freq: 1318.5, start: 0.18, length: 0.24 },
];
const total = Math.ceil(rate * 0.45);
const samples = new Int16Array(total);
for (const tone of tones) {
  const from = Math.floor(tone.start * rate);
  const count = Math.floor(tone.length * rate);
  for (let i = 0; i < count && from + i < total; i++) {
    const t = i / rate;
    const attack = Math.min(1, i / (rate * 0.01));
    const decay = Math.exp((-4 * i) / count);
    const value = Math.sin(2 * Math.PI * tone.freq * t) * attack * decay * 0.45;
    samples[from + i] = Math.max(-32767, Math.min(32767, samples[from + i] + Math.round(value * 32767)));
  }
}
const data = Buffer.from(samples.buffer);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(new URL('../assets/sounds/buko_rest_cue.wav', import.meta.url), Buffer.concat([header, data]));
