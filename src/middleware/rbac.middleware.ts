// ============================================================================
// src/middleware/rbac.middleware.ts
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export const requirePermission = (permission: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const role = (req as any).role;

        if (!role) {
            return res.status(403).json({ error: 'No role found' });
        }

        const permissions = role.permissions as string[];

        if (!permissions.includes(permission) && !permissions.includes('*')) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: permission,
            });
        }

        next();
    };
};