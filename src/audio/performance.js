// Pure timeline and session helpers. The audio engine and React UI share this contract.
export const DEFAULT_VELOCITY = 0.86;
export const QUANTIZE = Object.freeze({ '1/16': 1, '1/8': 2, '1/4': 4 });

export function velocitiesFromBanks(banks) {
  return banks.map(pattern => pattern.map(row => row.map(active => active ? DEFAULT_VELOCITY : 0)));
}

export function normalizeVelocities(raw, banks) {
  if (!Array.isArray(raw) || raw.length !== 4) return velocitiesFromBanks(banks);
  return banks.map((pattern, bank) => pattern.map((row, pad) => row.map((active, step) => {
    if (!active) return 0;
    const velocity = raw[bank]?.[pad]?.[step];
    return typeof velocity === 'number' && Number.isFinite(velocity) && velocity >= 0.05 && velocity <= 1
      ? velocity : DEFAULT_VELOCITY;
  })));
}

export function sanitizeChain(input) {
  if (!Array.isArray(input)) return [0, 1, 0, 2];
  const clean = input.slice(0, 16).filter(n => Number.isInteger(n) && n >= 0 && n < 4);
  return clean.length ? clean : [0];
}

export function chooseCaptureStep(events, now, division = '1/16') {
  if (!Number.isFinite(now) || !Array.isArray(events) || !events.length) return null;
  const period = QUANTIZE[division] || 1;
  let best = null;
  let distance = Infinity;
  for (const event of events) {
    if (!Number.isFinite(event.time) || !Number.isInteger(event.step) ||
        event.step < 0 || event.step > 15 || event.step % period !== 0 ||
        !Number.isInteger(event.bank) || event.bank < 0 || event.bank > 3) continue;
    const diff = Math.abs(event.time - now);
    // Resolve exact ties toward the earlier event for stable quantization.
    if (diff < distance || (diff === distance && best && event.time < best.time)) {
      best = event; distance = diff;
    }
  }
  return best ? { bank: best.bank, step: best.step, time: best.time } : null;
}
