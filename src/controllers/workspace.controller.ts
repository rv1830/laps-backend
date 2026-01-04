// ============================================================================
// src/controllers/workspace.controller.ts
// ============================================================================
import { Request, Response } from 'express';
import { prisma } from '../app';

export class WorkspaceController {

    /**
     * Create Workspace + Auto-Create 9 Professional Stages
     */
    async createWorkspace(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            
            const { name, industry, website, companySize, timezone } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Workspace name is required' });
            }

            // Transaction: Create Workspace -> Create Stages -> Assign Admin
            const result = await prisma.$transaction(async (tx) => {
                
                // 1. Ensure 'Admin' role exists
                let adminRole = await tx.role.findFirst({ where: { name: 'Admin' } });
                
                if (!adminRole) {
                    adminRole = await tx.role.create({
                        data: {
                            name: 'Admin',
                            description: 'Full access to workspace',
                            isSystem: true
                        }
                    });
                }

                // 2. Create Workspace
                const newWorkspace = await tx.workspace.create({
                    data: {
                        name,
                        industry,
                        website,      
                        companySize,  
                        timezone: timezone || 'UTC', 
                        isActive: true,
                        settings: {
                            dateFormat: 'DD/MM/YYYY',
                            workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
                        },
                        aiSettings: {
                            dataEnrichment: true,
                            emailDrafting: true
                        },
                        complianceSettings: {
                            gdprEnabled: false
                        }
                    }
                });

                // 3. MAGIC STEP: Automatically Create 8-9 Stages (Full Flow)
                await tx.stage.createMany({
                    data: [
                        { workspaceId: newWorkspace.id, name: 'New Lead',      order: 0, color: '#3b82f6' }, // Blue
                        { workspaceId: newWorkspace.id, name: 'Contacted',     order: 1, color: '#f59e0b' }, // Orange
                        { workspaceId: newWorkspace.id, name: 'Replied',       order: 2, color: '#06b6d4' }, // Cyan (NEW)
                        { workspaceId: newWorkspace.id, name: 'Call Booked',   order: 3, color: '#8b5cf6' }, // Purple (NEW)
                        { workspaceId: newWorkspace.id, name: 'Presented',     order: 4, color: '#d946ef' }, // Fuchsia (NEW)
                        { workspaceId: newWorkspace.id, name: 'Proposal Sent', order: 5, color: '#ec4899' }, // Pink
                        { workspaceId: newWorkspace.id, name: 'Won',           order: 6, color: '#10b981', isWon: true },    // Green
                        { workspaceId: newWorkspace.id, name: 'Lost',          order: 7, color: '#ef4444', isClosed: true }  // Red
                    ]
                });

                // 4. Link User as Admin
                await tx.workspaceUser.create({
                    data: {
                        userId: userId,
                        workspaceId: newWorkspace.id,
                        roleId: adminRole.id,
                        isActive: true
                    }
                });

                return newWorkspace;
            });

            return res.status(201).json({
                message: 'Workspace and Pipeline created successfully',
                workspace: result
            });

        } catch (error) {
            console.error('Create Workspace Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get All Workspaces
     */
    async getWorkspaces(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;

            const memberships = await prisma.workspaceUser.findMany({
                where: { userId: userId, isActive: true },
                include: { workspace: true, role: true },
                orderBy: { joinedAt: 'desc' }
            });

            const workspaces = memberships.map(m => ({
                id: m.workspace.id,
                name: m.workspace.name,
                industry: m.workspace.industry,
                website: m.workspace.website,
                companySize: m.workspace.companySize,
                timezone: m.workspace.timezone,
                role: m.role.name,
                isActive: m.workspace.isActive,
                createdAt: m.workspace.createdAt
            }));

            return res.json({ workspaces });

        } catch (error) {
            console.error('Get Workspaces Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get Single Workspace
     */
    async getWorkspace(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { workspaceId } = req.params;

            const member = await prisma.workspaceUser.findUnique({
                where: { workspaceId_userId: { workspaceId, userId } },
                include: { role: true }
            });

            if (!member || !member.isActive) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId }
            });

            return res.json({ workspace, userRole: member.role.name });

        } catch (error) {
            console.error('Get Workspace Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Update Workspace
     */
    async updateWorkspace(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { workspaceId } = req.params;
            const { name, industry, website, companySize, timezone, settings } = req.body;

            const member = await prisma.workspaceUser.findUnique({
                where: { workspaceId_userId: { workspaceId, userId } },
                include: { role: true }
            });

            if (!member || member.role.name !== 'Admin') {
                return res.status(403).json({ error: 'Only Admin can update settings' });
            }

            const updatedWorkspace = await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    name,
                    industry,
                    website,
                    companySize,
                    timezone,
                    settings: settings ? settings : undefined
                }
            });

            return res.json({ message: 'Updated', workspace: updatedWorkspace });

        } catch (error) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Delete Workspace
     */
    async deleteWorkspace(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { workspaceId } = req.params;

            const member = await prisma.workspaceUser.findUnique({
                where: { workspaceId_userId: { workspaceId, userId } },
                include: { role: true }
            });

            if (!member || member.role.name !== 'Admin') {
                return res.status(403).json({ error: 'Only Admin can delete workspace' });
            }

            await prisma.workspace.update({
                where: { id: workspaceId },
                data: { isActive: false }
            });

            return res.json({ message: 'Workspace deleted' });

        } catch (error) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
}