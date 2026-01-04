// ============================================================================
// src/routes/pipeline.routes.ts
// ============================================================================

import { Router } from 'express';
import { PipelineController } from '../controllers/pipeline.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';

const router = Router();
const controller = new PipelineController();

router.use(authenticate);

// 1. Create Stage
router.post(
    '/workspaces/:workspaceId/stages', 
    validateWorkspace, 
    controller.createStage.bind(controller)
);

// 2. Get All Stages
router.get(
    '/workspaces/:workspaceId/stages', 
    validateWorkspace, 
    controller.getStages.bind(controller)
);

// 3. Update Stage (Edit Name, Color, Order)
router.patch(
    '/workspaces/:workspaceId/stages/:stageId',
    validateWorkspace,
    controller.updateStage.bind(controller)
);

// 4. Delete Stage
router.delete(
    '/workspaces/:workspaceId/stages/:stageId',
    validateWorkspace,
    controller.deleteStage.bind(controller)
);

export default router;