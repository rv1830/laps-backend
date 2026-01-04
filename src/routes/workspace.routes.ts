import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Placeholder handlers (Apna WorkspaceController bana ke replace kar lena)
const getWorkspaces = (req: Request, res: Response) => { res.json({ message: "Get workspaces" }) };
const createWorkspace = (req: Request, res: Response) => { res.json({ message: "Create workspace" }) };

// Apply Auth Middleware
router.use(authenticate);

router.get('/workspaces', getWorkspaces);
router.post('/workspaces', createWorkspace);

export default router;