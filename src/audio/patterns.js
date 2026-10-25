export const PAD_PRESETS = [
  { name: 'KICK', kind: 'kick', note: 36, group: 'drums', color: 'coral' },
  { name: 'SNARE', kind: 'snare', note: 38, group: 'drums', color: 'coral' },
  { name: 'CL. HAT', kind: 'hat', note: 42, group: 'drums', color: 'gold' },
  { name: 'OP. HAT', kind: 'openhat', note: 46, group: 'drums', color: 'gold' },
  { name: 'CLAP', kind: 'clap', note: 39, group: 'drums', color: 'coral' },
  { name: 'LOW TOM', kind: 'tom', note: 41, group: 'drums', color: 'coral' },
  { name: 'RIM', kind: 'rim', note: 37, group: 'drums', color: 'gold' },
  { name: 'PERC', kind: 'perc', note: 54, group: 'drums', color: 'gold' },
  { name: 'SUB BASS', kind: 'sub', note: 36, group: 'synth', color: 'violet' },
  { name: 'ACID', kind: 'acid', note: 48, group: 'synth', color: 'violet' },
  { name: 'CHORD', kind: 'chord', note: 60, group: 'synth', color: 'blue' },
  { name: 'PLUCK', kind: 'pluck', note: 67, group: 'synth', color: 'blue' },
  { name: 'LEAD', kind: 'lead', note: 72, group: 'synth', color: 'violet' },
  { name: 'ORGAN', kind: 'organ', note: 60, group: 'synth', color: 'blue' },
  { name: 'BELL', kind: 'bell', note: 84, group: 'synth', color: 'blue' },
  { name: 'DRONE', kind: 'drone', note: 48, group: 'synth', color: 'violet' },
];
export const HOTKEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
export const makeEmptyPattern = () => Array.from({ length: 16 }, () => Array(16).fill(false));
export function makeDemoPattern() {
  const p = makeEmptyPattern();
  [0, 4, 8, 11, 12].forEach(i => p[0][i] = true);
  [4, 12].forEach(i => p[1][i] = true);
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(i => p[2][i] = true);
  [7, 15].forEach(i => p[3][i] = true);
  [4, 12].forEach(i => p[4][i] = true);
  [2, 10].forEach(i => p[7][i] = true);
  [0, 3, 8, 11].forEach(i => p[8][i] = true);
  [6, 14].forEach(i => p[11][i] = true);
  return p;
}
export const makePatternBanks = () => [makeDemoPattern(), makeEmptyPattern(), makeEmptyPattern(), makeEmptyPattern()];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
export const midiToHz = note => 440 * Math.pow(2, (note - 69) / 12);
export const noteName = midi => {
  const labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return labels[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
};
export function isPattern(value) {
  return Array.isArray(value) && value.length === 16 && value.every(
    row => Array.isArray(row) && row.length === 16 && row.every(step => typeof step === 'boolean')
  );
}
