import express from 'express';
import { logger } from '../utils/logger.js';
import { Institution } from '../models/Institution.js';

const router = express.Router();

// GET /api/v1/institutions - Get all institutions
router.get('/', async (req, res) => {
  try {
    const institutions = await Institution.find({}, { name: 1 })
      .sort({ name: 1 })
      .lean();

    return res.json({
      institutions: institutions.map((inst) => ({
        id: inst._id,
        name: inst.name,
      })),
    });
  } catch (err) {
    logger.error('Institutions route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/institutions/search?query=...
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res.json({ institutions: [] });
    }

    const institutions = await Institution.find(
      { name: { $regex: query, $options: 'i' } },
      { name: 1 },
    )
      .limit(10)
      .lean();

    return res.json({
      institutions: institutions.map((inst) => ({
        id: inst._id,
        name: inst.name,
      })),
    });
  } catch (err) {
    logger.error('Institutions route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/institutions
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const existing = await Institution.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ error: 'Institution already exists' });
    }

    const institution = await Institution.create({ name: name.trim() });

    return res.status(201).json({
      id: institution._id,
      name: institution.name,
    });
  } catch (err) {
    logger.error('Institutions route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

