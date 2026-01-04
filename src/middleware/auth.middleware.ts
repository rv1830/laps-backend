// ============================================================================
// src/middleware/auth.middleware.ts
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { authConfig } from '../config/auth'; 

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
    let token;

    // 1. Check Authorization Header (For Postman/Mobile)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // 2. Check Cookies (For Web/Vercel)
    else if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc: any, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        token = cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify
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
    // console.error('Middleware Auth Error:', error); 
    return res.status(401).json({ error: 'Invalid token' });
  }
};