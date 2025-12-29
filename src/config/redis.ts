// ============================================================================
// src/config/redis.ts
// ============================================================================
import Redis from 'ioredis';
import Queue from 'bull';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Job Queues
export const sequenceQueue = new Queue('sequence-processor', process.env.REDIS_URL!);
export const workflowQueue = new Queue('workflow-processor', process.env.REDIS_URL!);
export const emailSyncQueue = new Queue('email-sync', process.env.REDIS_URL!);
export const analyticsQueue = new Queue('analytics-aggregator', process.env.REDIS_URL!);
