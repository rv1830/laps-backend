// ============================================================================
// src/controllers/proposal.controller.ts
// ============================================================================
import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export class ProposalController {
    async createProposal(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const { leadId, title, lineItems, subtotal, tax, total, currency } = req.body;

            const proposal = await prisma.proposal.create({
                data: {
                    workspaceId: workspaceId!,
                    leadId,
                    title,
                    content: {},
                    lineItems: lineItems || [],
                    subtotal,
                    tax: tax || 0,
                    total,
                    currency: currency || 'USD',
                    status: 'draft',
                },
            });

            // Create activity
            await prisma.activity.create({
                data: {
                    workspaceId: workspaceId!,
                    leadId,
                    type: 'proposal_created',
                    title: `Proposal created: ${title}`,
                    metadata: { proposalId: proposal.id },
                },
            });

            res.status(201).json(proposal);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async sendProposal(req: AuthRequest, res: Response) {
        try {
            const { proposalId } = req.params;

            const proposal = await prisma.proposal.update({
                where: { id: proposalId },
                data: {
                    status: 'sent',
                    sentAt: new Date(),
                },
            });

            // TODO: Generate PDF and send via email

            res.json(proposal);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}