import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { WorkspaceController } from '../controllers/workspace.controller';

const router = Router();
const workspaceController = new WorkspaceController();

// All routes here require Authentication
router.use(authenticate);

// Create & List
router.post('/workspaces', workspaceController.createWorkspace.bind(workspaceController) as RequestHandler);
router.get('/workspaces', workspaceController.getWorkspaces.bind(workspaceController) as RequestHandler);

// Single Workspace Operations (ID based)
router.get('/workspaces/:workspaceId', workspaceController.getWorkspace.bind(workspaceController) as RequestHandler);
router.patch('/workspaces/:workspaceId', workspaceController.updateWorkspace.bind(workspaceController) as RequestHandler); // Update
router.delete('/workspaces/:workspaceId', workspaceController.deleteWorkspace.bind(workspaceController) as RequestHandler); // Delete

export default router;