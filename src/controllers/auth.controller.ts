import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../app';
import { authConfig } from '../config/auth';
import { validateEmail } from '../utils/validators';

export class AuthController {

    /**
     * Register a new user
     */
    async register(req: Request, res: Response) {
        try {
            const { email, password, firstName, lastName, phone, timezone } = req.body;

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

            // 4. Create user
            const user = await prisma.user.create({
                data: {
                    email,
                    passwordHash,
                    firstName,
                    lastName,
                    phone,
                    timezone,
                    isActive: true,
                },
            });

            // 5. Generate Token
            const token = jwt.sign(
                { userId: user.id, email: user.email },
                authConfig.jwtSecret,
                { expiresIn: authConfig.jwtExpiresIn as any }
            );

            // 6. Return response (exclude password)
            const { passwordHash: _, ...userWithoutPassword } = user;

            return res.status(201).json({
                message: 'User registered successfully',
                token,
                user: userWithoutPassword,
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
            const token = jwt.sign(
                { userId: user.id, email: user.email },
                authConfig.jwtSecret,
                { expiresIn: authConfig.jwtExpiresIn as any }
            );

            // 5. Return response
            const { passwordHash: _, ...userWithoutPassword } = user;

            return res.json({
                message: 'Login successful',
                token,
                user: userWithoutPassword,
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

            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            const user = await prisma.user.findUnique({
                where: { email },
            });

            // Security: Don't reveal if user exists, just return success
            if (!user) {
                return res.json({ message: 'If an account exists, a reset link has been sent.' });
            }

            // Generate a specific reset token (valid for 1 hour)
            // We encode the password hash in the secret so that if the password changes, the token is invalidated (optional but good practice)
            // But purely using a separate secret is easier for now.
            const resetToken = jwt.sign(
                { userId: user.id, type: 'reset' },
                authConfig.jwtSecret,
                { expiresIn: '1h' }
            );

            // TODO: Send email with the link using EmailService/Controller
            // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
            // await sendEmail(user.email, 'Password Reset', resetLink);

            console.log(`[Mock Email] Reset Token for ${email}: ${resetToken}`);

            return res.json({ message: 'If an account exists, a reset link has been sent.' });

        } catch (error) {
            console.error('Forgot Password Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Reset Password - Set new password using token
     */
    async resetPassword(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body;

            if (!token || !newPassword) {
                return res.status(400).json({ error: 'Token and new password are required' });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters' });
            }

            // 1. Verify token
            let decoded: any;
            try {
                decoded = jwt.verify(token, authConfig.jwtSecret);
            } catch (err) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }

            if (decoded.type !== 'reset') {
                return res.status(400).json({ error: 'Invalid token type' });
            }

            // 2. Hash new password
            const passwordHash = await bcrypt.hash(newPassword, authConfig.saltRounds);

            // 3. Update user
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
            // Assumes 'authenticate' middleware adds 'user' to req
            const user = (req as any).user;

            if (!user) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            // Fetch fresh data
            const freshUser = await prisma.user.findUnique({
                where: { id: user.id }
            });

            if (!freshUser) {
                return res.status(404).json({ error: 'User not found' });
            }

            const { passwordHash: _, ...userWithoutPassword } = freshUser;

            return res.json({ user: userWithoutPassword });

        } catch (error) {
            console.error('Me Error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
}
