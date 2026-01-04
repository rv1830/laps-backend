// ============================================================================
// src/app.ts - Main Application Entry
// ============================================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

// Middleware & Utilities
import { errorHandler } from './middleware/error.middleware';
import { setupJobs } from './jobs/index';
import { logger } from './utils/logger';

// Routes Imports
import authRoutes from './routes/auth.routes';
import workspaceRoutes from './routes/workspace.routes';
import leadRoutes from './routes/lead.routes';
import sequenceRoutes from './routes/sequence.routes';
import analyticsRoutes from './routes/analytics.routes';

export const prisma = new PrismaClient();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg) } }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =======================
// API Routes Mounting
// =======================

// 1. Auth Routes (Public)
// URL: /api/auth/register, /api/auth/login
app.use('/api', authRoutes); 

// 2. Feature Routes (Protected internally via middleware in files)
// Note: Humne /api prefix sabke liye common rakha hai
app.use('/api', workspaceRoutes);
app.use('/api', leadRoutes);
app.use('/api', sequenceRoutes);
app.use('/api', analyticsRoutes);

// Bull Board for job monitoring
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [], // Will add queues during setup
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Error handling
app.use(errorHandler);

// Initialize jobs
setupJobs();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;