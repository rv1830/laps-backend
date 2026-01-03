import { Request, Response } from 'express';
import { prisma } from '../app';

export class WorkspaceController {

    // List all workspaces user belongs to
    async getWorkspaces(req: Request, res: Response) {
        try {
            const user = (req as any).user;

            const memberships = await prisma.workspaceUser.findMany({
                where: {
                    userId: user.userId,
                    isActive: true,
                },
                include: {
                    workspace: true,
                    role: true,
                },
            });

            const workspaces = memberships.map(m => {
                const shortId = m.workspace.id.slice(-8);
                return {
                    _id: `ws_${shortId}`,
                    name: m.workspace.name,
                    industry: m.workspace.industry,
                    status: m.workspace.isActive ? 'active' : 'inactive',
                    createdAt: m.workspace.createdAt.toISOString(),
                    role: m.role.name,
                };
            });

            return res.json({ workspaces });

        } catch (error) {
            console.error('Get Workspaces Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Create additional workspace (after onboarding)
    async createAdditionalWorkspace(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { name, industry } = req.body;

            if (!name || name.trim().length < 2) {
                return res.status(400).json({ error: 'Workspace name required' });
            }

            const ownerRole = await prisma.role.findFirst({ where: { name: 'Owner' } });
            if (!ownerRole) return res.status(500).json({ error: 'Owner role missing' });

            const workspace = await prisma.$transaction(async (tx) => {
                const newWs = await tx.workspace.create({
                    data: {
                        name: name.trim(),
                        industry: industry || null,
                        isActive: true,
                    },
                });

                await tx.workspaceUser.create({
                    data: {
                        userId: user.userId,
                        workspaceId: newWs.id,
                        roleId: ownerRole.id,
                        isActive: true,
                    },
                });

                return newWs;
            });

            const shortId = workspace.id.slice(-8);

            return res.status(201).json({
                _id: `ws_${shortId}`,
                name: workspace.name,
                industry: workspace.industry,
                status: 'active',
                createdAt: workspace.createdAt.toISOString(),
            });

        } catch (error) {
            console.error('Create Additional Workspace Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
}