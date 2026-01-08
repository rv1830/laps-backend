import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';
import { LeadController } from '../controllers/lead.controller';

const router = Router();
const leadController = new LeadController();

// 1. Authenticate User
router.use(authenticate);

// 2. Validate Workspace ID for all routes with :workspaceId
router.use('/workspaces/:workspaceId', validateWorkspace);

// Routes
router.post('/workspaces/:workspaceId', leadController.createLead.bind(leadController) as RequestHandler);
router.get('/workspaces/:workspaceId', leadController.getLeads.bind(leadController) as RequestHandler);
router.get('/workspaces/:workspaceId/:leadId', leadController.getLead.bind(leadController) as RequestHandler);
router.patch('/workspaces/:workspaceId/:leadId', leadController.updateLead.bind(leadController) as RequestHandler);
router.post('/workspaces/:workspaceId/import', leadController.importLeads.bind(leadController) as RequestHandler);
router.delete('/workspaces/:workspaceId/:leadId', leadController.deleteLead.bind(leadController) as RequestHandler);
export default router;