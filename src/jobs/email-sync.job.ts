// ============================================================================
// src/jobs/email-sync.job.ts
// ============================================================================
import { Job } from 'bull';
import { prisma } from '../app';
import { EmailOrchestrator } from '../services/email/email-orchestrator.service';
import { logger } from '../utils/logger';

export async function EmailSyncProcessor(job: Job) {
  logger.info('Starting email sync job');
  
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
    });

    const orchestrator = new EmailOrchestrator();

    for (const account of accounts) {
      try {
        await orchestrator.syncInbox(account.id);
        logger.info(`Synced email account ${account.email}`);
      } catch (error: any) {
        logger.error(`Failed to sync ${account.email}:`, error.message);
        
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { syncError: error.message },
        });
      }
    }

    // Reset daily counters if needed
    const now = new Date();
    await prisma.emailAccount.updateMany({
      where: {
        lastReset: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
      },
      data: {
        sentToday: 0,
        lastReset: now,
      },
    });

    logger.info('Email sync completed');
    return { success: true };
  } catch (error: any) {
    logger.error('Email sync failed:', error);
    throw error;
  }
}
