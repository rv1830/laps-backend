import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const authController = new AuthController();

// Public routes
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));

// Protected routes (Authenticated users only)
router.post('/setup-profile', authenticate, authController.setupProfile.bind(authController)); 
router.get('/check-status', authenticate, authController.me.bind(authController));

// Logout route (Token cookie clear karne ke liye)
router.post('/logout', authenticate, authController.logout.bind(authController));

export default router;