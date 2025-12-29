// ============================================================================
// src/jobs/sequence-processor.job.ts
// ============================================================================
import { Job } from 'bull';
import { SequenceEngine } from '../services/automation/sequence-engine.service';
import { logger } from '../utils/logger';

export async function SequenceProcessor(job: Job) {
  logger.info('Starting sequence processing job');
  
  try {
    const engine = new SequenceEngine();
    await engine.processEnrollments();
    logger.info('Sequence processing completed');
    return { success: true };
  } catch (error: any) {
    logger.error('Sequence processing failed:', error);
    throw error;
  }
}
