const PROFILE_MAX_BYTES = 5 * 1024 * 1024;
const MEMORY_MAX_BYTES = 25 * 1024 * 1024;

const PROFILE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MEMORY_MIME_TYPES = new Set([
  ...PROFILE_MIME_TYPES,
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export { PROFILE_MAX_BYTES, MEMORY_MAX_BYTES };

export function normalizeMimeType(value) {
  if (typeof value !== 'string') return '';
  return value.split(';')[0].trim().toLowerCase();
}

export function isAllowedProfileMimeType(mimeType) {
  return PROFILE_MIME_TYPES.has(normalizeMimeType(mimeType));
}

export function isAllowedMemoryMimeType(mimeType) {
  return MEMORY_MIME_TYPES.has(normalizeMimeType(mimeType));
}

export function getMemoryMediaType(mimeType) {
  return normalizeMimeType(mimeType).startsWith('video/') ? 'video' : 'image';
}
