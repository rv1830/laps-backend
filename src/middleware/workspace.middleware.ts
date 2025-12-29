// ============================================================================
// src/middleware/workspace.middleware.ts
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { prisma } from '../app';

export const validateWorkspace = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const membership = await prisma.workspaceUser.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: req.user!.id,
        },
      },
      include: {
        workspace: true,
        role: true,
      },
    });

    if (!membership || !membership.isActive) {
      return res.status(403).json({ error: 'Access denied to workspace' });
    }

    req.workspaceId = workspaceId;
    (req as any).role = membership.role;
    next();
  } catch (error) {
    next(error);
  }
};
