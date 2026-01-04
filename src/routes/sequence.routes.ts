import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validateWorkspace } from '../middleware/workspace.middleware';
import { SequenceController } from '../controllers/sequence.controller';

const router = Router();
const sequenceController = new SequenceController();

router.use(authenticate);
router.use('/workspaces/:workspaceId', validateWorkspace);

router.post('/workspaces/:workspaceId/sequences', sequenceController.createSequence.bind(sequenceController) as RequestHandler);
router.get('/workspaces/:workspaceId/sequences', sequenceController.getSequences.bind(sequenceController) as RequestHandler);
router.post('/workspaces/:workspaceId/sequences/enroll', sequenceController.enrollLead.bind(sequenceController) as RequestHandler);

export default router;