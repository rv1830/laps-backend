import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { authConfig } from '../config/auth';
import { validateEmail } from '../utils/validators';

export class AuthController {

    /**
     * Step 1: Register (Identity Only)
     * Inputs: email, password, confirmPassword
     */
    async register(req: Request, res: Response) {
        try {
            const { email, password, confirmPassword } = req.body;

            // 1. Validation
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

            // 2. Check if user exists
            const existingUser = await prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return res.status(409).json({ error: 'User already exists with this email' });
            }

            // 3. Hash password
            const passwordHash = await bcrypt.hash(password, authConfig.saltRounds);

            // 4. TRANSACTION: Create User + Check Invites
            // Note: User is created without Name/DOB/Phone initially (Schema must allow nulls for these)
            const result = await prisma.$transaction(async (tx) => {
                // A. Create User
                const newUser = await tx.user.create({
                    data: {
                        email,
                        passwordHash,
                        isActive: true,
                        // firstName, lastName, dob, phone abhi null rahenge
                    },
                });

                // B. Check Pending Invites (Auto-join logic)
                const pendingInvites = await tx.invitation.findMany({
                    where: { 
                        email: email, 
                        status: 'PENDING',
                        expiresAt: { gt: new Date() }
                    }
                });

                let joinedAnyWorkspace = false;

                if (pendingInvites.length > 0) {
                    for (const invite of pendingInvites) {
                        await tx.workspaceUser.create({
                            data: {
                                userId: newUser.id,
                                workspaceId: invite.workspaceId,
                                roleId: invite.roleId
                            }
                        });

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

            // 6. Set Cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000
            });

            // 7. Return response
            // CHANGE: User object removed from response
            return res.status(201).json({
                message: 'User registered successfully. Please complete your profile.',
                token,
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
     * Inputs: firstName, lastName, dob, phoneNumber
     */
    async setupProfile(req: Request, res: Response) {
        try {
            // FIX: Middleware 'id' bhejta hai, 'userId' nahi.
            const userId = (req as any).user.id; 
            
            // Debugging log (Optional: Check karne ke liye ki ID aa rahi hai)
            console.log('Setup Profile for User ID:', userId);

            const { firstName, lastName, dob, phoneNumber } = req.body;

            // Validation
            if (!firstName || !lastName || !dob || !phoneNumber) {
                return res.status(400).json({ error: 'All profile fields are required' });
            }

            // Update User
            const updatedUser = await prisma.user.update({
                where: { id: userId }, // Ab ye undefined nahi hoga
                data: {
                    firstName,
                    lastName,
                    dob: new Date(dob),
                    phoneNumber,
                }
            });

            // Check workspace status
            const workspaceCount = await prisma.workspaceUser.count({
                where: { userId: userId, isActive: true }
            });

            const { passwordHash: _, ...userWithoutPassword } = updatedUser;

            return res.json({
                message: 'Profile setup complete',
                user: userWithoutPassword,
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

            const user = await prisma.user.findUnique({
                where: { email },
            });

            if (!user || !user.passwordHash) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            if (!user.isActive) {
                return res.status(403).json({ error: 'Account is disabled' });
            }

            const isMatch = await bcrypt.compare(password, user.passwordHash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });

            const token = this.generateToken(user);

            const workspaceCount = await prisma.workspaceUser.count({
                where: { userId: user.id, isActive: true }
            });

            res.cookie('token', token, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production' 
            });

            // Logic to determine redirection on Login
            let nextStep = 'DASHBOARD';
            // Check if profile is incomplete (Agar firstName null hai toh setup pe bhejo)
            if (!user.firstName || !user.lastName) {
                nextStep = 'SETUP_PROFILE';
            } else if (workspaceCount === 0) {
                nextStep = 'CREATE_WORKSPACE'; // Or 'ONBOARDING'
            }

            // CHANGE: User object removed from response
            return res.json({
                message: 'Login successful',
                token,
                nextStep,
                hasWorkspaces: workspaceCount > 0
            });

        } catch (error) {
            console.error('Login Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Forgot Password
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

            // FIX: Using user.id consistent with middleware
            const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
            if (!freshUser) return res.status(404).json({ error: 'User not found' });

            const { passwordHash: _, ...userWithoutPassword } = freshUser;
            
            // Re-calculate workspace count for accurate frontend state
            const workspaceCount = await prisma.workspaceUser.count({
                 where: { userId: user.id, isActive: true }
            });

            return res.json({ 
                user: userWithoutPassword,
                hasWorkspaces: workspaceCount > 0
            });

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