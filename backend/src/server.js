import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import institutionRoutes from './routes/institutions.js';
import userRoutes from './routes/users.js';
import batchRoutes from './routes/batches.js';
import superlativeRoutes from './routes/superlatives.js';
import memoryRoutes from './routes/memories.js';
import uploadRoutes from './routes/uploads.js';
import {
  ensureDefaultSuperlatives,
  enforceSingleProfileReaction,
} from './services/bootstrapService.js';

const app = express();

// Trust proxy for platforms like Railway/Render
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS: allow only the configured frontend origin
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);

// JSON body parsing
app.use(express.json({ limit: '1mb' }));

// Basic rate limiting
const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'okay',
    env: env.nodeEnv,
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/institutions', institutionRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/batches', batchRoutes);
app.use('/api/v1/superlatives', superlativeRoutes);
app.use('/api/v1/memories', memoryRoutes);
app.use('/api/v1/uploads', uploadRoutes);

async function start() {
  try {
    await mongoose.connect(env.mongoUri);
    console.log('Connected to MongoDB');
    await ensureDefaultSuperlatives();
    console.log('Default superlatives ensured');
    const cleanedLikes = await enforceSingleProfileReaction();
    if (cleanedLikes > 0) {
      console.log(`Removed ${cleanedLikes} duplicate profile reactions`);
    }

    app.listen(env.port, () => {
      console.log(`Yearbook API listening on port ${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
