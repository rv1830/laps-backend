// ============================================================================
// src/jobs/index.ts - Job Setup
// ============================================================================
import { sequenceQueue, workflowQueue, emailSyncQueue, analyticsQueue } from '../config/redis';
import { SequenceProcessor } from './sequence-processor.job';
import { WorkflowProcessor } from './workflow-processor.job';
import { EmailSyncProcessor } from './email-sync.job';
import { AnalyticsAggregator } from './analytics-aggregator.job';

export function setupJobs() {
  // Sequence processor - runs every minute
  sequenceQueue.process(10, SequenceProcessor);
  sequenceQueue.add({}, { repeat: { cron: '*/1 * * * *' } });

  // Workflow processor - runs every 30 seconds
  workflowQueue.process(10, WorkflowProcessor);
  
  // Email sync - runs every 5 minutes
  emailSyncQueue.process(5, EmailSyncProcessor);
  emailSyncQueue.add({}, { repeat: { cron: '*/5 * * * *' } });

  // Analytics aggregator - runs hourly
  analyticsQueue.process(1, AnalyticsAggregator);
  analyticsQueue.add({}, { repeat: { cron: '0 * * * *' } });
}