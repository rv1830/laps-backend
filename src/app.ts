// ============================================================================
// src/app.ts - Main Application Entry
// ============================================================================
import 'dotenv/config'; // Sabse upar zaroori hai
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';

// Redis/Bull Board imports commented out temporarily
// import { createBullBoard } from '@bull-board/api';
// import { BullAdapter } from '@bull-board/api/bullAdapter';
// import { ExpressAdapter } from '@bull-board/express';

// Middleware & Utilities
import { errorHandler } from './middleware/error.middleware';
// import { setupJobs } from './jobs/index'; // Commented out
import { logger } from './utils/logger';

// Routes Imports
import authRoutes from './routes/auth.routes';
import workspaceRoutes from './routes/workspace.routes';
import leadRoutes from './routes/lead.routes';
import sequenceRoutes from './routes/sequence.routes';
import analyticsRoutes from './routes/analytics.routes';
import integrationRoutes from './routes/integration.routes';
import pipelineRoutes from './routes/pipeline.routes';

export const prisma = new PrismaClient();

const app = express();
app.set('trust proxy', 1);

// Middleware
app.use(helmet());

// CORS Configuration
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:8080',                // Local React
        'http://localhost:4000',                // Local React (Alternate)
        'https://laps-ui-demo.vercel.app'       // Production Frontend (Vercel)
    ],
    credentials: true, // IMPORTANT: Allows cookies to be sent/received
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg) } }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =======================
// API Routes Mounting
// =======================

// 1. Auth Routes
app.use('/api', authRoutes); 
app.use('/api', workspaceRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/sequence', sequenceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/pipeline', pipelineRoutes);
/* // --- REDIS / BULL BOARD DISABLED TEMPORARILY ---
// Bull Board for job monitoring
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [], // Will add queues during setup
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
*/

// Error handling
app.use(errorHandler);

// Initialize jobs
// setupJobs(); // Commented out to stop Redis connection attempts

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;