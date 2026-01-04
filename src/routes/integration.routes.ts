import { Router } from 'express';
import { IntegrationController } from '../controllers/integration.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';

const router = Router();
const controller = new IntegrationController();

// ============================================================================
// 1. PUBLIC ROUTES (Sabse Upar - Bina Login ke chalenge)
// ============================================================================
// Ye line 'authenticate' se pehle hona ZAROORI hai
router.get('/hubspot/callback', controller.handleHubSpotCallback.bind(controller));


// ============================================================================
// 2. SECURITY GATE (Yahan se niche sab Blocked hai bina Login ke)
// ============================================================================
router.use(authenticate); 


// ============================================================================
// 3. PROTECTED ROUTES (Login + Workspace ID Required)
// ============================================================================

// Connect Button (URL Generate karna)
router.get(
    '/workspaces/:workspaceId/hubspot/auth', 
    validateWorkspace, 
    controller.initiateHubSpotAuth.bind(controller)
);

// Import Button (Contacts fetch karna)
router.post(
    '/workspaces/:workspaceId/hubspot/import', 
    validateWorkspace, 
    controller.importHubSpotContacts.bind(controller)
);

export default router;