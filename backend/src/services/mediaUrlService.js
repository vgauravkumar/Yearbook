import { createSignedReadUrl } from './imageService.js';
import { logger } from '../utils/logger.js';

export async function signMediaUrl(key) {
  if (!key) return null;

  try {
    return await createSignedReadUrl({ key });
  } catch (err) {
    logger.error('Failed to sign media URL', { error: err });
    return null;
  }
}
