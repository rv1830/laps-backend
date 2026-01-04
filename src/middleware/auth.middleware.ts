// ============================================================================
// src/middleware/auth.middleware.ts
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { authConfig } from '../config/auth'; // <-- IMPORT ZAROORI HAI

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  workspaceId?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // "Bearer " handle karne ke liye safe logic
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.split(' ')[1] 
        : authHeader;

    if (!token) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    // MAIN FIX: process.env ki jagah authConfig use kiya
    const decoded = jwt.verify(token, authConfig.jwtSecret) as any;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid token or user inactive' });
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (error) {
    console.error('Middleware Auth Error:', error); // Debugging ke liye log
    return res.status(401).json({ error: 'Invalid token' });
  }
};