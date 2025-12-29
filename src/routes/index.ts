// ============================================================================
// src/routes/index.ts
// ============================================================================
import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { LeadController } from '../controllers/lead.controller';
import { SequenceController } from '../controllers/sequence.controller';
import { WorkflowController } from '../controllers/workflow.controller';
import { AnalyticsController } from '../controllers/analytics.controller';
import authRoutes from './auth.routes';

const router = Router();

const leadController = new LeadController();
const sequenceController = new SequenceController();
const workflowController = new WorkflowController();
const analyticsController = new AnalyticsController();
// Auth routes
router.use('/auth', authRoutes);

// Protected routes
router.use(authenticate);

// Workspace routes
router.get('/workspaces', /* get user workspaces */);
router.post('/workspaces', /* create workspace */);

// Workspace-specific routes
router.use('/workspaces/:workspaceId', validateWorkspace);

// Leads
router.post('/workspaces/:workspaceId/leads', leadController.createLead.bind(leadController) as RequestHandler);
router.get('/workspaces/:workspaceId/leads', leadController.getLeads.bind(leadController) as RequestHandler);
router.get('/workspaces/:workspaceId/leads/:leadId', leadController.getLead.bind(leadController) as RequestHandler);
router.patch('/workspaces/:workspaceId/leads/:leadId', leadController.updateLead.bind(leadController) as RequestHandler);
router.post('/workspaces/:workspaceId/leads/import', leadController.importLeads.bind(leadController) as RequestHandler);

// Sequences
router.post('/workspaces/:workspaceId/sequences', sequenceController.createSequence.bind(sequenceController) as RequestHandler);
router.get('/workspaces/:workspaceId/sequences', sequenceController.getSequences.bind(sequenceController) as RequestHandler);
router.post('/workspaces/:workspaceId/sequences/enroll', sequenceController.enrollLead.bind(sequenceController) as RequestHandler);

// Workflows
router.post('/workspaces/:workspaceId/workflows', workflowController.createWorkflow.bind(workflowController) as RequestHandler);
router.get('/workspaces/:workspaceId/workflows', workflowController.getWorkflows.bind(workflowController) as RequestHandler);
router.get('/workspaces/:workspaceId/workflows/:workflowId/runs', workflowController.getWorkflowRuns.bind(workflowController) as RequestHandler);
router.post('/workspaces/:workspaceId/workflows/:workflowId/execute', workflowController.executeWorkflow.bind(workflowController) as RequestHandler);

// Analytics
router.get('/workspaces/:workspaceId/analytics/funnel', analyticsController.getFunnelMetrics.bind(analyticsController) as RequestHandler);
router.get('/workspaces/:workspaceId/analytics/sources', analyticsController.getSourceMetrics.bind(analyticsController) as RequestHandler);
router.get('/workspaces/:workspaceId/analytics/email', analyticsController.getEmailMetrics.bind(analyticsController) as RequestHandler);

export default router;