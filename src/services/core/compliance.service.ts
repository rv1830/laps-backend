// ============================================================================
// src/services/core/compliance.service.ts
// ============================================================================
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export class ComplianceService {
    async checkCanSend(workspaceId: string, email: string): Promise<{ canSend: boolean; reason?: string }> {
        // Check suppression list
        const suppressed = await prisma.suppressionList.findUnique({
            where: { workspaceId_email: { workspaceId, email } },
        });

        if (suppressed) {
            return { canSend: false, reason: `Suppressed: ${suppressed.reason}` };
        }

        // Check bounce history
        const lead = await prisma.lead.findFirst({
            where: { workspaceId, email },
        });

        if (lead?.isBounced) {
            return { canSend: false, reason: 'Email bounced' };
        }

        if (lead?.isUnsubscribed) {
            return { canSend: false, reason: 'Unsubscribed' };
        }

        return { canSend: true };
    }

    async handleUnsubscribe(workspaceId: string, email: string) {
        // Add to suppression list
        await prisma.suppressionList.upsert({
            where: { workspaceId_email: { workspaceId, email } },
            create: {
                workspaceId,
                email,
                reason: 'unsubscribed',
            },
            update: {
                reason: 'unsubscribed',
            },
        });

        // Update lead
        await prisma.lead.updateMany({
            where: { workspaceId, email },
            data: { isUnsubscribed: true },
        });

        // Stop all active sequences
        const leads = await prisma.lead.findMany({
            where: { workspaceId, email },
            select: { id: true },
        });

        const leadIds = leads.map((l: { id: string }) => l.id);

        await prisma.sequenceEnrollment.updateMany({
            where: { leadId: { in: leadIds }, status: 'active' },
            data: { status: 'stopped', stoppedAt: new Date() },
        });
    }

    async handleBounce(workspaceId: string, email: string) {
        await prisma.suppressionList.upsert({
            where: { workspaceId_email: { workspaceId, email } },
            create: {
                workspaceId,
                email,
                reason: 'bounced',
            },
            update: {
                reason: 'bounced',
            },
        });

        await prisma.lead.updateMany({
            where: { workspaceId, email },
            data: { isBounced: true },
        });
    }
}