import { Router } from 'express';
import { AcceleratorController } from '../controllers/accelerator.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';

const router = Router();
const ctrl = new AcceleratorController();

// ============================================================================
// 1. PUBLIC ROUTES (End-user access - No Login Required)
// ============================================================================
router.get('/p/:slug', ctrl.getPublicData.bind(ctrl));
router.post('/p/:slug/submit', ctrl.submitLead.bind(ctrl));


// ============================================================================
// 2. SECURITY GATE (Block everything below if not logged in)
// ============================================================================
router.use(authenticate);


// ============================================================================
// 3. PROTECTED ROUTES (Admin only - Workspace Context Required)
// ============================================================================
router.post(
    '/workspaces/:workspaceId', 
    validateWorkspace, 
    ctrl.saveAccelerator.bind(ctrl)
);

export default router;