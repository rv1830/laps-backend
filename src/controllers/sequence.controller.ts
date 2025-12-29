
// ============================================================================
// src/controllers/sequence.controller.ts
// ============================================================================
import { Request, Response } from 'express';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth.middleware';
import { SequenceEngine } from '../services/automation/sequence-engine.service';

export class SequenceController {
    async createSequence(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const { name, description, automationMode, steps } = req.body;

            const sequence = await prisma.sequence.create({
                data: {
                    workspaceId: workspaceId!,
                    name,
                    description,
                    automationMode: automationMode || 'assisted',
                    isActive: false,
                },
            });

            // Create steps
            if (steps && Array.isArray(steps)) {
                for (let i = 0; i < steps.length; i++) {
                    await prisma.sequenceStep.create({
                        data: {
                            sequenceId: sequence.id,
                            stepNumber: i,
                            stepType: steps[i].stepType,
                            subject: steps[i].subject,
                            body: steps[i].body,
                            delayValue: steps[i].delayValue,
                            delayUnit: steps[i].delayUnit,
                            conditions: steps[i].conditions,
                        },
                    });
                }
            }

            res.status(201).json(sequence);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async enrollLead(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const { sequenceId, leadId } = req.body;

            // Verify sequence belongs to workspace
            const sequence = await prisma.sequence.findFirst({
                where: { id: sequenceId, workspaceId: workspaceId! },
            });

            if (!sequence) {
                return res.status(404).json({ error: 'Sequence not found' });
            }

            // Check if already enrolled
            const existing = await prisma.sequenceEnrollment.findUnique({
                where: { sequenceId_leadId: { sequenceId, leadId } },
            });

            if (existing) {
                return res.status(409).json({ error: 'Lead already enrolled' });
            }

            const enrollment = await prisma.sequenceEnrollment.create({
                data: { sequenceId, leadId, status: 'active' },
            });

            // Create activity
            await prisma.activity.create({
                data: {
                    workspaceId: workspaceId!,
                    leadId,
                    userId: req.user!.id,
                    type: 'sequence_enrolled',
                    title: `Enrolled in sequence: ${sequence.name}`,
                },
            });

            res.status(201).json(enrollment);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSequences(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;

            const sequences = await prisma.sequence.findMany({
                where: { workspaceId: workspaceId! },
                include: {
                    steps: { orderBy: { stepNumber: 'asc' } },
                    _count: {
                        select: {
                            enrollments: { where: { status: 'active' } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });

            res.json(sequences);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}