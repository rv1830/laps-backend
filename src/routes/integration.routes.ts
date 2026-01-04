import { Router } from 'express';
import { IntegrationController } from '../controllers/integration.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';

const router = Router();
const controller = new IntegrationController();

// --- PUBLIC ROUTE (Callback from HubSpot) ---
// Isme Auth middleware nahi lagega kyunki HubSpot call karega
router.get('/hubspot/callback', controller.handleHubSpotCallback.bind(controller));


// --- PROTECTED ROUTES (Requires Login + Workspace Access) ---
router.use(authenticate); // User login check

// 1. Initiate Auth (Get URL)
router.get(
    '/workspaces/:workspaceId/hubspot/auth', 
    validateWorkspace, 
    controller.initiateHubSpotAuth.bind(controller)
);

// 2. Import Contacts
router.post(
    '/workspaces/:workspaceId/hubspot/import', 
    validateWorkspace, 
    controller.importHubSpotContacts.bind(controller)
);

export default router;