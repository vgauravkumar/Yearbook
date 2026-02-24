import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { env } from './config/env.js';
import { dynamo, TABLE_NAME } from './db/dynamoClient.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import batchRoutes from './routes/batches.js';
import superlativeRoutes from './routes/superlatives.js';
import memoryRoutes from './routes/memories.js';
import uploadRoutes from './routes/uploads.js';
import { requestLogger } from './middleware/requestLogger.js';
import { logger } from './utils/logger.js';
import {
  ensureDefaultSuperlatives,
  enforceSingleProfileReaction,
} from './services/bootstrapService.js';
import {
  runBatchFreezeJob,
  scheduleBatchFreezeJob,
} from './services/batchFreezeService.js';
import { migrateLegacyBatchData } from './services/legacyMigrationService.js';

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
app.use(requestLogger);

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
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/batches', batchRoutes);
app.use('/api/v1/superlatives', superlativeRoutes);
app.use('/api/v1/memories', memoryRoutes);
app.use('/api/v1/uploads', uploadRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  logger.error('Unhandled server error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    error: err,
  });
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await dynamo.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 1,
      }),
    );
    logger.info('Connected to DynamoDB');
    await ensureDefaultSuperlatives();
    logger.info('Default superlatives ensured');
    const cleanedLikes = await enforceSingleProfileReaction();
    if (cleanedLikes > 0) {
      logger.info('Removed duplicate profile reactions', { cleanedLikes });
    }
    await migrateLegacyBatchData();
    await runBatchFreezeJob(new Date());
    scheduleBatchFreezeJob();

    app.listen(env.port, () => {
      logger.info('Yearbook API listening', { port: env.port, env: env.nodeEnv });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err });
    process.exit(1);
  }
}

start();
