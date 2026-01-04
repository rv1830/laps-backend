import { Request, Response } from 'express';
import { prisma } from '../app';

export class WorkspaceController {

    /**
     * Create a new CRM Workspace
     * Inputs: name, industry, website, companySize, timezone
     */
    async createWorkspace(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            
            // Destructure inputs
            const { 
                name, 
                industry, 
                website,      
                companySize,  
                timezone      
            } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Workspace name is required' });
            }

            // Transaction: Create Workspace + Assign Admin Role
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
                // Ab hum data ko direct columns mein daal rahe hain
                const newWorkspace = await tx.workspace.create({
                    data: {
                        name,
                        industry,
                        website,      // Saved to column
                        companySize,  // Saved to column
                        timezone: timezone || 'UTC', // Saved to column
                        
                        isActive: true,
                        
                        // Settings JSON ab clean rahega (future configs ke liye)
                        settings: {
                            dateFormat: 'DD/MM/YYYY',
                            workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
                        },
                        
                        // Default CRM settings
                        aiSettings: {
                            dataEnrichment: true,
                            emailDrafting: true
                        },
                        complianceSettings: {
                            gdprEnabled: false
                        }
                    }
                });

                // 3. Link User as Admin
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
                message: 'Workspace created successfully',
                workspace: result
            });

        } catch (error) {
            console.error('Create Workspace Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get All Workspaces for Current User
     */
    async getWorkspaces(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;

            const memberships = await prisma.workspaceUser.findMany({
                where: {
                    userId: userId,
                    isActive: true
                },
                include: {
                    workspace: true,
                    role: true 
                },
                orderBy: {
                    joinedAt: 'desc'
                }
            });

            // Flatten structure
            const workspaces = memberships.map(m => ({
                id: m.workspace.id,
                name: m.workspace.name,
                industry: m.workspace.industry,
                // Direct columns se data aa raha hai ab
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
     * Get Single Workspace Details
     */
    async getWorkspace(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { workspaceId } = req.params;

            const member = await prisma.workspaceUser.findUnique({
                where: {
                    workspaceId_userId: { workspaceId, userId }
                },
                include: { role: true }
            });

            if (!member || !member.isActive) {
                return res.status(403).json({ error: 'Access denied or workspace not found' });
            }

            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId }
            });

            return res.json({ 
                workspace,
                userRole: member.role.name 
            });

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
            // Update mein bhi fields destructure kar lo
            const { name, industry, website, companySize, timezone, settings } = req.body;

            // 1. Check permission
            const member = await prisma.workspaceUser.findUnique({
                where: { workspaceId_userId: { workspaceId, userId } },
                include: { role: true }
            });

            if (!member || member.role.name !== 'Admin') {
                return res.status(403).json({ error: 'Only workspace Admin can update settings' });
            }

            // 2. Update
            const updatedWorkspace = await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    name,
                    industry,
                    website,      // Direct Column Update
                    companySize,  // Direct Column Update
                    timezone,     // Direct Column Update
                    settings: settings ? settings : undefined
                }
            });

            return res.json({
                message: 'Workspace updated successfully',
                workspace: updatedWorkspace
            });

        } catch (error) {
            console.error('Update Workspace Error:', error);
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
                return res.status(403).json({ error: 'Only workspace Admin can delete workspace' });
            }

            await prisma.workspace.update({
                where: { id: workspaceId },
                data: { isActive: false }
            });

            return res.json({ message: 'Workspace deleted successfully' });

        } catch (error) {
            console.error('Delete Workspace Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
}