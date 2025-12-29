
// ============================================================================
// src/controllers/workflow.controller.ts
// ============================================================================
import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { WorkflowEngine } from '../services/automation/workflow-engine.service';

export class WorkflowController {
    private engine = new WorkflowEngine();

    async createWorkflow(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const { name, description, triggerType, triggerConfig, automationMode, definition } = req.body;

            const workflow = await prisma.workflow.create({
                data: {
                    workspaceId: workspaceId!,
                    name,
                    description,
                    triggerType,
                    triggerConfig: triggerConfig || {},
                    automationMode: automationMode || 'assisted',
                    definition: definition || {},
                    isActive: false,
                },
            });

            res.status(201).json(workflow);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getWorkflows(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;

            const workflows = await prisma.workflow.findMany({
                where: { workspaceId: workspaceId! },
                include: {
                    _count: { select: { runs: true } },
                },
                orderBy: { createdAt: 'desc' },
            });

            res.json(workflows);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getWorkflowRuns(req: AuthRequest, res: Response) {
        try {
            const { workflowId } = req.params;
            const { page = 1, limit = 20 } = req.query;

            const [runs, total] = await Promise.all([
                prisma.workflowRun.findMany({
                    where: { workflowId },
                    orderBy: { startedAt: 'desc' },
                    skip: (Number(page) - 1) * Number(limit),
                    take: Number(limit),
                }),
                prisma.workflowRun.count({ where: { workflowId } }),
            ]);

            res.json({
                runs,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit)),
                },
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async executeWorkflow(req: AuthRequest, res: Response) {
        try {
            const { workflowId } = req.params;
            const { triggerData } = req.body;

            await this.engine.executeWorkflow(workflowId, triggerData);

            res.json({ message: 'Workflow execution started' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}