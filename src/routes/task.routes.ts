import { Router } from 'express';
import { TaskController } from '../controllers/task.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const taskController = new TaskController();

// Authentication middleware
router.use(authenticate);

// Ab saare routes URL based workspaceId use karenge
// Base path app.ts mein "/api/tasks" hai

router.post('/workspaces/:workspaceId', taskController.createTask); 
router.get('/workspaces/:workspaceId', taskController.getTasks);
router.patch('/workspaces/:workspaceId/:id', taskController.updateTask);
router.delete('/workspaces/:workspaceId/:id', taskController.deleteTask);

export default router;