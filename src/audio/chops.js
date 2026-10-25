// Pure, serializable chops. All boundaries are fractions of the unmodified source duration.
export const CHOP_COUNT = 16;
export const equalMarkers = () => Array.from({ length: CHOP_COUNT + 1 }, (_, i) => i / CHOP_COUNT);

export function validMarkers(value) {
  if (!Array.isArray(value) || value.length !== CHOP_COUNT + 1 ||
      !(value[0] >= 0) || !(value[CHOP_COUNT] <= 1)) return false;
  return value.every((v, i) => typeof v === 'number' && Number.isFinite(v) &&
    v >= 0 && v <= 1 && (i === 0 || v - value[i - 1] >= 0.002));
}
export const normalizeMarkers = value => validMarkers(value) ? [...value] : equalMarkers();

export function moveMarker(markers, boundary, position) {
  const next = normalizeMarkers(markers);
  if (!Number.isInteger(boundary) || boundary <= 0 || boundary >= CHOP_COUNT ||
      !Number.isFinite(position)) return next;
  const min = next[boundary - 1] + 0.002;
  const max = next[boundary + 1] - 0.002;
  next[boundary] = Math.min(max, Math.max(min, position));
  return next;
}
export function sliceFor(markers, index) {
  const m = normalizeMarkers(markers);
  const i = Math.max(0, Math.min(CHOP_COUNT - 1, Math.floor(Number(index) || 0)));
  return { start: m[i], end: m[i + 1], reverse: false };
}
export function normalizeChop(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { start, end, sourceId } = raw;
  if (typeof sourceId !== 'string' || !/^[a-f0-9]{64}$/.test(sourceId) ||
      typeof start !== 'number' || typeof end !== 'number' ||
      !Number.isFinite(start) || !Number.isFinite(end) ||
      start < 0 || end > 1 || end - start < 0.002) return null;
  return {
    sourceId, start, end, reverse: raw.reverse === true,
    ...(Number.isFinite(raw.sourceBpm) && raw.sourceBpm >= 65 && raw.sourceBpm <= 190
      ? { sourceBpm: Math.round(raw.sourceBpm) } : {})
  };
}
export function playbackWindow(chop, sourceDuration, tune = 0) {
  const region = normalizeChop(chop);
  if (!region || !Number.isFinite(sourceDuration) || sourceDuration <= 0) return null;
  const duration = (region.end - region.start) * sourceDuration;
  const rate = Math.pow(2, Math.min(12, Math.max(-12, Number(tune) || 0)) / 12);
  return {
    offset: (region.reverse ? 1 - region.end : region.start) * sourceDuration,
    duration,
    rate,
    audibleSeconds: duration / rate
  };
}

export function chopAssignments(id, markers, flipped = false, sourceBpm = null) {
  const m = normalizeMarkers(markers);
  return Array.from({ length: CHOP_COUNT }, (_, i) => ({
    sourceId: id,
    start: m[flipped ? CHOP_COUNT - i - 1 : i],
    end: m[flipped ? CHOP_COUNT - i : i + 1],
    reverse: false,
    ...(Number.isFinite(sourceBpm) && sourceBpm >= 65 && sourceBpm <= 190 ?
      { sourceBpm: Math.round(sourceBpm) } : {})
  }));
}
export async function sourceFingerprint(file) {
  if (!globalThis.crypto?.subtle?.digest) throw new Error('Sample hashing requires HTTPS or localhost.');
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function audioPeaks(buffer, columns = 800) {
  if (!buffer || !Number.isFinite(buffer.length) || buffer.length <= 0) return [];
  const n = Math.min(1600, Math.max(64, Math.floor(columns)));
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i));
  if (!channels.length) return [];
  const result = [];
  for (let x = 0; x < n; x++) {
    const start = Math.floor(x * buffer.length / n);
    const end = Math.min(buffer.length, Math.max(start + 1, Math.floor((x + 1) * buffer.length / n)));
    const stride = Math.max(1, Math.floor((end - start) / 60));
    let min = 1, max = -1;
    for (let i = start; i < end; i += stride) for (const channel of channels) {
      const value = channel[i] || 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    result.push({ min: Math.max(-1, min), max: Math.min(1, max) });
  }
  return result;
}
