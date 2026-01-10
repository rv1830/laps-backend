// ============================================================================
// src/controllers/pipeline.controller.ts
// ============================================================================
import { Request, Response } from 'express';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth.middleware';

export class PipelineController {
  
  /**
   * 1. Create a New Stage
   */
  async createStage(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const { name, order, color } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Stage name is required' });
      }

      // Logic: Agar user ne order nahi diya, to sabse last mein add karo
      let newOrder = order;
      if (newOrder === undefined) {
          const lastStage = await prisma.stage.findFirst({
              where: { workspaceId: workspaceId! },
              orderBy: { order: 'desc' }
          });
          newOrder = (lastStage?.order || 0) + 1;
      }

      const stage = await prisma.stage.create({
        data: {
          name,
          order: newOrder,
          color: color || '#000000',
          workspace: {
            connect: { id: workspaceId! }
          }
        }
      });

      res.status(201).json(stage);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 2. Get All Stages (Ordered by sequence)
   */
  async getStages(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;

      const stages = await prisma.stage.findMany({
        where: { workspaceId: workspaceId! },
        orderBy: { order: 'asc' }
      });

      res.json(stages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 3. Update Stage (Rename, Change Color, Reorder)
   */
  async updateStage(req: AuthRequest, res: Response) {
    try {
        const { stageId } = req.params;
        const { name, color, order, isWon, isClosed } = req.body;

        const updated = await prisma.stage.update({
            where: { id: stageId },
            data: {
                name,
                color,
                order,
                isWon,
                isClosed
            }
        });
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
  }

  /**
   * 4. Delete Stage
   * Note: Leads in this stage will be automatically deleted because of 
   * 'onDelete: Cascade' in the Prisma schema.
   */
  async deleteStage(req: AuthRequest, res: Response) {
      try {
          const { stageId } = req.params;
          
          // Step 1: Delete the stage. 
          // Because of onDelete: Cascade in schema, related leads are deleted by DB.
          await prisma.stage.delete({ 
              where: { id: stageId } 
          });
          
          res.json({ 
              message: 'Stage and all its associated leads deleted successfully' 
          });
      } catch (error: any) {
          res.status(500).json({ error: error.message });
      }
  }
}