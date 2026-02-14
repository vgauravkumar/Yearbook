import { createSignedReadUrl } from './imageService.js';

export async function signMediaUrl(key) {
  if (!key) return null;

  try {
    return await createSignedReadUrl({ key });
  } catch (err) {
    console.error('Failed to sign media URL', err);
    return null;
  }
}
