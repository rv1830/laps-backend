import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';
import { AnalyticsController } from '../controllers/analytics.controller';

const router = Router();
const analyticsController = new AnalyticsController();

router.use(authenticate);
router.use('/workspaces/:workspaceId', validateWorkspace);

router.get('/workspaces/:workspaceId/analytics/funnel', analyticsController.getFunnelMetrics.bind(analyticsController) as RequestHandler);
router.get('/workspaces/:workspaceId/analytics/sources', analyticsController.getSourceMetrics.bind(analyticsController) as RequestHandler);
router.get('/workspaces/:workspaceId/analytics/email', analyticsController.getEmailMetrics.bind(analyticsController) as RequestHandler);

export default router;