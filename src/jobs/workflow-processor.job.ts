// ============================================================================
// src/jobs/workflow-processor.job.ts
// ============================================================================
import { Job } from 'bull';
import { prisma } from '../app';
import { WorkflowEngine } from '../services/automation/workflow-engine.service';
import { logger } from '../utils/logger';

export async function WorkflowProcessor(job: Job) {
  const { workflowId, triggerData } = job.data;
  
  logger.info(`Processing workflow ${workflowId}`);
  
  try {
    const engine = new WorkflowEngine();
    await engine.executeWorkflow(workflowId, triggerData);
    return { success: true };
  } catch (error: any) {
    logger.error(`Workflow ${workflowId} failed:`, error);
    throw error;
  }
}