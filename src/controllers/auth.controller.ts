import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { authConfig } from '../config/auth';
import { validateEmail } from '../utils/validators';

export class AuthController {

    /**
     * Register a new user (Step 1: Identity)
     * Checks for pending invitations to auto-join workspaces.
     */
    async register(req: Request, res: Response) {
        try {
            // Simplified Input (No phone/timezone/workspace name here)
            const { email, password, firstName, lastName } = req.body;

            // 1. Validation
            if (!email || !password || !firstName || !lastName) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            if (!validateEmail(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            if (password.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters' });
            }

            // 2. Check if user exists
            const existingUser = await prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return res.status(409).json({ error: 'User already exists with this email' });
            }

            // 3. Hash password
            const passwordHash = await bcrypt.hash(password, authConfig.saltRounds);

            // 4. TRANSACTION: Create User + Check Invites (The Fork Logic)
            const result = await prisma.$transaction(async (tx) => {
                // A. Create User
                const newUser = await tx.user.create({
                    data: {
                        email,
                        passwordHash,
                        firstName,
                        lastName,
                        isActive: true,
                    },
                });

                // B. Check Pending Invites
                const pendingInvites = await tx.invitation.findMany({
                    where: { 
                        email: email, 
                        status: 'PENDING',
                        expiresAt: { gt: new Date() } // Must not be expired
                    }
                });

                let joinedAnyWorkspace = false;

                if (pendingInvites.length > 0) {
                    for (const invite of pendingInvites) {
                        // Create Relation (WorkspaceUser)
                        await tx.workspaceUser.create({
                            data: {
                                userId: newUser.id,
                                workspaceId: invite.workspaceId,
                                roleId: invite.roleId
                            }
                        });

                        // Mark invite accepted
                        await tx.invitation.update({
                            where: { id: invite.id },
                            data: { status: 'ACCEPTED' }
                        });
                        
                        joinedAnyWorkspace = true;
                    }
                }

                return { user: newUser, joinedAnyWorkspace };
            });

            // 5. Generate Token
            const token = this.generateToken(result.user);

            // 6. Set Cookie (Recommended)
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000 // 1 day
            });

            // 7. Return response
            const { passwordHash: _, ...userWithoutPassword } = result.user;

            return res.status(201).json({
                message: 'User registered successfully',
                token,
                user: userWithoutPassword,
                // IMPORTANT: Tells frontend where to go next
                hasWorkspaces: result.joinedAnyWorkspace
            });

        } catch (error) {
            console.error('Register Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Login user
     */
    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            // 1. Find user
            const user = await prisma.user.findUnique({
                where: { email },
            });

            if (!user || !user.passwordHash) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            if (!user.isActive) {
                return res.status(403).json({ error: 'Account is disabled' });
            }

            // 2. Compare password
            const isMatch = await bcrypt.compare(password, user.passwordHash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // 3. Update last login
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });

            // 4. Generate token
            const token = this.generateToken(user);

            // 5. Check if user has workspaces
            const workspaceCount = await prisma.workspaceUser.count({
                where: { userId: user.id, isActive: true }
            });

            // 6. Set Cookie
            res.cookie('token', token, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production' 
            });

            // 7. Return response
            const { passwordHash: _, ...userWithoutPassword } = user;

            return res.json({
                message: 'Login successful',
                token,
                user: userWithoutPassword,
                hasWorkspaces: workspaceCount > 0
            });

        } catch (error) {
            console.error('Login Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Forgot Password - Request Reset Link
     */
    async forgotPassword(req: Request, res: Response) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'Email is required' });

            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) return res.json({ message: 'If an account exists, a reset link has been sent.' });

            const resetToken = jwt.sign(
                { userId: user.id, type: 'reset' },
                authConfig.jwtSecret,
                { expiresIn: '1h' }
            );

            console.log(`[Mock Email] Reset Token for ${email}: ${resetToken}`);
            return res.json({ message: 'If an account exists, a reset link has been sent.' });

        } catch (error) {
            console.error('Forgot Password Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Reset Password
     */
    async resetPassword(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
            if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

            let decoded: any;
            try {
                decoded = jwt.verify(token, authConfig.jwtSecret);
            } catch (err) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }

            if (decoded.type !== 'reset') return res.status(400).json({ error: 'Invalid token type' });

            const passwordHash = await bcrypt.hash(newPassword, authConfig.saltRounds);

            await prisma.user.update({
                where: { id: decoded.userId },
                data: { passwordHash },
            });

            return res.json({ message: 'Password has been reset successfully' });

        } catch (error) {
            console.error('Reset Password Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get Current User Profile
     */
    async me(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ error: 'Not authenticated' });

            const freshUser = await prisma.user.findUnique({ where: { id: user.userId } });
            if (!freshUser) return res.status(404).json({ error: 'User not found' });

            const { passwordHash: _, ...userWithoutPassword } = freshUser;
            return res.json({ user: userWithoutPassword });

        } catch (error) {
            console.error('Me Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Helper to generate token
    private generateToken(user: any) {
        return jwt.sign(
            { userId: user.id, email: user.email },
            authConfig.jwtSecret,
            { expiresIn: authConfig.jwtExpiresIn as any }
        );
    }
}