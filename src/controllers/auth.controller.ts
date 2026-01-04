import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { authConfig, cookieOptions } from '../config/auth'; // Import options
import { validateEmail } from '../utils/validators';

export class AuthController {

    /**
     * Step 1: Register (Identity Only)
     */
    async register(req: Request, res: Response) {
        try {
            const { email, password, confirmPassword } = req.body;

            if (!email || !password || !confirmPassword) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            if (!validateEmail(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            if (password.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters' });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({ error: 'Passwords do not match' });
            }

            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return res.status(409).json({ error: 'User already exists with this email' });
            }

            const passwordHash = await bcrypt.hash(password, authConfig.saltRounds);

            const result = await prisma.$transaction(async (tx) => {
                const newUser = await tx.user.create({
                    data: { email, passwordHash, isActive: true },
                });

                const pendingInvites = await tx.invitation.findMany({
                    where: { email: email, status: 'PENDING', expiresAt: { gt: new Date() } }
                });

                let joinedAnyWorkspace = false;
                if (pendingInvites.length > 0) {
                    for (const invite of pendingInvites) {
                        await tx.workspaceUser.create({
                            data: { userId: newUser.id, workspaceId: invite.workspaceId, roleId: invite.roleId }
                        });
                        await tx.invitation.update({
                            where: { id: invite.id }, data: { status: 'ACCEPTED' }
                        });
                        joinedAnyWorkspace = true;
                    }
                }
                return { user: newUser, joinedAnyWorkspace };
            });

            const token = this.generateToken(result.user);

            // SET COOKIE (No token in body)
            res.cookie('token', token, cookieOptions);

            return res.status(201).json({
                message: 'User registered successfully. Please complete your profile.',
                // Token removed
                nextStep: 'SETUP_PROFILE', 
                hasWorkspaces: result.joinedAnyWorkspace
            });

        } catch (error) {
            console.error('Register Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Step 2: Setup Profile
     */
    async setupProfile(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id; 
            const { firstName, lastName, dob, phoneNumber } = req.body;

            if (!firstName || !lastName || !dob || !phoneNumber) {
                return res.status(400).json({ error: 'All profile fields are required' });
            }

            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: { firstName, lastName, dob: new Date(dob), phoneNumber }
            });

            const workspaceCount = await prisma.workspaceUser.count({
                where: { userId: userId, isActive: true }
            });

            const { passwordHash: _, ...userWithoutPassword } = updatedUser;

            return res.json({
                message: 'Profile setup complete',
                // User object removed
                nextStep: workspaceCount > 0 ? 'DASHBOARD' : 'CREATE_WORKSPACE',
                hasWorkspaces: workspaceCount > 0
            });

        } catch (error) {
            console.error('Setup Profile Error:', error);
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

            const user = await prisma.user.findUnique({ where: { email } });
            if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
            if (!user.isActive) return res.status(403).json({ error: 'Account is disabled' });

            const isMatch = await bcrypt.compare(password, user.passwordHash);
            if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

            await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

            const token = this.generateToken(user);

            // Fetch User's Workspaces
            const userWorkspaces = await prisma.workspaceUser.findMany({
                where: { userId: user.id, isActive: true },
                include: { workspace: { select: { id: true, name: true } } }
            });

            const workspaces = userWorkspaces.map(uw => ({
                id: uw.workspace.id,
                name: uw.workspace.name
            }));

            // SET COOKIE (No token in body)
            res.cookie('token', token, cookieOptions);

            let nextStep = 'DASHBOARD';
            if (!user.firstName || !user.lastName) {
                nextStep = 'SETUP_PROFILE';
            } else if (workspaces.length === 0) {
                nextStep = 'CREATE_WORKSPACE';
            }

            return res.json({
                message: 'Login successful',
                // Token removed
                nextStep,
                hasWorkspaces: workspaces.length > 0,
                workspaces
            });

        } catch (error) {
            console.error('Login Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // ... ForgotPassword, ResetPassword, Me (Same as before, keep helper generateToken)
    async forgotPassword(req: Request, res: Response) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'Email is required' });
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) return res.json({ message: 'If an account exists, a reset link has been sent.' });
            const resetToken = jwt.sign({ userId: user.id, type: 'reset' }, authConfig.jwtSecret, { expiresIn: '1h' });
            console.log(`[Mock Email] Reset Token for ${email}: ${resetToken}`);
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        } catch (error) { return res.status(500).json({ error: 'Internal server error' }); }
    }

    async resetPassword(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) return res.status(400).json({ error: 'Token/Password required' });
            let decoded: any;
            try { decoded = jwt.verify(token, authConfig.jwtSecret); } catch (err) { return res.status(400).json({ error: 'Invalid token' }); }
            if (decoded.type !== 'reset') return res.status(400).json({ error: 'Invalid token type' });
            const passwordHash = await bcrypt.hash(newPassword, authConfig.saltRounds);
            await prisma.user.update({ where: { id: decoded.userId }, data: { passwordHash } });
            return res.json({ message: 'Password has been reset successfully' });
        } catch (error) { return res.status(500).json({ error: 'Internal server error' }); }
    }

    async me(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (!user) return res.status(401).json({ error: 'Not authenticated' });
            const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
            if (!freshUser) return res.status(404).json({ error: 'User not found' });
            const { passwordHash: _, ...userWithoutPassword } = freshUser;
            const workspaceCount = await prisma.workspaceUser.count({ where: { userId: user.id, isActive: true } });
            return res.json({ user: userWithoutPassword, hasWorkspaces: workspaceCount > 0 });
        } catch (error) { return res.status(500).json({ error: 'Internal server error' }); }
    }

    private generateToken(user: any) {
        return jwt.sign(
            { userId: user.id, email: user.email },
            authConfig.jwtSecret,
            { expiresIn: authConfig.jwtExpiresIn as any }
        );
    }
}