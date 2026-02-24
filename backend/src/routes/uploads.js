import express from 'express';
import { logger } from '../utils/logger.js';

import { authRequired } from '../middleware/auth.js';
import {
  buildMemoryObjectKey,
  buildProfileObjectKey,
  createPresignedUpload,
} from '../services/imageService.js';
import {
  MEMORY_MAX_BYTES,
  PROFILE_MAX_BYTES,
  isAllowedMemoryMimeType,
  isAllowedProfileMimeType,
  normalizeMimeType,
} from '../services/uploadPolicy.js';
import {
  ensureBatchWritable,
  getCurrentBatchMembershipByUserId,
} from '../services/batchService.js';

const router = express.Router();

function parseSizeBytes(value) {
  if (typeof value !== 'number') return Number.NaN;
  return Number.isFinite(value) ? Math.floor(value) : Number.NaN;
}

async function getViewerBatchId(userId) {
  const membership = await getCurrentBatchMembershipByUserId(userId);
  return membership?.batchId ?? null;
}

// POST /api/v1/uploads/presign
router.post('/presign', authRequired, async (req, res) => {
  try {
    const kind = typeof req.body?.kind === 'string' ? req.body.kind.trim() : '';
    const mimeType = normalizeMimeType(req.body?.mime_type);
    const sizeBytes = parseSizeBytes(req.body?.size_bytes);
    const userId = req.user._id.toString();

    if (!kind || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return res.status(400).json({
        error: 'kind, mime_type, and size_bytes are required',
      });
    }

    let objectKey = '';
    let maxBytes = 0;

    if (kind === 'profile') {
      if (!isAllowedProfileMimeType(mimeType)) {
        return res.status(400).json({ error: 'Unsupported profile image type' });
      }

      maxBytes = PROFILE_MAX_BYTES;
      objectKey = buildProfileObjectKey(userId);

      const batchId = await getViewerBatchId(req.user._id);
      if (batchId) {
        const writable = await ensureBatchWritable(batchId);
        if (!writable.ok) {
          return res.status(writable.status).json({ error: writable.error });
        }
      }
    } else if (kind === 'memory') {
      if (!isAllowedMemoryMimeType(mimeType)) {
        return res.status(400).json({ error: 'Unsupported memory file type' });
      }

      maxBytes = MEMORY_MAX_BYTES;
      objectKey = buildMemoryObjectKey(userId, mimeType);

      const batchId = await getViewerBatchId(req.user._id);
      if (!batchId) {
        return res.status(400).json({ error: 'User not onboarded' });
      }

      const writable = await ensureBatchWritable(batchId);
      if (!writable.ok) {
        return res.status(writable.status).json({ error: writable.error });
      }
    } else {
      return res.status(400).json({ error: 'kind must be profile or memory' });
    }

    if (sizeBytes > maxBytes) {
      return res.status(400).json({
        error: `File too large (max ${Math.floor(maxBytes / (1024 * 1024))}MB)`,
      });
    }

    const presignedUpload = await createPresignedUpload({
      key: objectKey,
      contentType: mimeType,
    });

    return res.json({
      upload_url: presignedUpload.uploadUrl,
      object_key: objectKey,
      expires_at: presignedUpload.expiresAt,
      required_headers: presignedUpload.requiredHeaders,
    });
  } catch (err) {
    logger.error('Uploads route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
