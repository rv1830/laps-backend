import { Request, Response } from 'express';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth.middleware';

export class AcceleratorController {
  
  /**
   * 1. SAVE/UPDATE ACCELERATOR (Protected)
   * Handles creating and updating configuration for Surveys, Bio-links, etc.
   */
  async saveAccelerator(req: AuthRequest, res: Response) {
    try {
      // workspaceId is injected via validateWorkspace middleware
      const { workspaceId } = req;
      const { id, name, type, config, slug } = req.body;

      if (!workspaceId) {
        return res.status(403).json({ 
          error: "Forbidden", 
          message: "Access denied. Workspace context is missing or invalid." 
        });
      }

      // Check for required fields
      if (!name || !type) {
        return res.status(400).json({ 
          error: "Bad Request", 
          message: "Name and Type are required fields." 
        });
      }

      const accelerator = await prisma.accelerator.upsert({
        where: { id: id || 'new-uuid-placeholder' },
        update: { 
          name, 
          config, 
          slug, 
          isActive: true 
        },
        create: {
          workspaceId: workspaceId!,
          name,
          type,
          config,
          slug: slug || `acc_${Math.random().toString(36).substring(7)}`,
        }
      });

      return res.status(200).json(accelerator);
    } catch (error: any) {
      console.error("Save Accelerator Error:", error);
      return res.status(500).json({ 
        error: "Internal Server Error", 
        message: "Failed to save accelerator configuration. Please try again later." 
      });
    }
  }

  /**
   * 2. GET PUBLIC ACCELERATOR DATA (Public)
   * Fetches data based on slug for public viewing. Logs a 'view' event.
   */
  async getPublicData(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      
      const data = await prisma.accelerator.findUnique({
        where: { slug },
        select: {
          id: true,
          name: true,
          type: true,
          config: true,
          workspaceId: true
        }
      });

      if (!data) {
        return res.status(404).json({ 
          error: "Not Found", 
          message: "The requested accelerator link does not exist or has been moved." 
        });
      }

      // Track View Analytics (Async - don't block the response)
      prisma.acceleratorAnalytics.create({
        data: {
          acceleratorId: data.id,
          eventType: 'view',
          userAgent: req.headers['user-agent'] || 'unknown',
          ipAddress: req.ip || 'unknown'
        }
      }).catch(err => console.error("Analytics Error:", err));

      return res.json(data);
    } catch (error: any) {
      return res.status(500).json({ 
        error: "Server Error", 
        message: "Unable to retrieve accelerator data at this time." 
      });
    }
  }

  /**
   * 3. SUBMIT PUBLIC LEAD (Public)
   * Captures lead info from public forms and syncs with CRM.
   */
  async submitLead(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const { email, firstName, lastName, responses, source } = req.body;

      if (!email) {
        return res.status(400).json({ 
            error: "Missing Data", 
            message: "Email address is required to submit the form." 
        });
      }

      const acc = await prisma.accelerator.findUnique({ where: { slug } });
      if (!acc) {
        return res.status(404).json({ 
            error: "Source Not Found", 
            message: "This submission path is no longer active." 
        });
      }

      // Find the first stage of the workspace to assign the lead automatically
      const defaultStage = await prisma.stage.findFirst({
        where: { workspaceId: acc.workspaceId },
        orderBy: { order: 'asc' }
      });

      const lead = await prisma.lead.upsert({
        where: { workspaceId_email: { workspaceId: acc.workspaceId, email } },
        update: { 
          lastActivityAt: new Date(),
          customFields: responses || {}
        },
        create: {
          workspaceId: acc.workspaceId,
          email,
          firstName,
          lastName,
          fullName: `${firstName || ''} ${lastName || ''}`.trim() || email,
          source: source || acc.name,
          stageId: defaultStage?.id || 'none',
          customFields: responses || {},
          acceleratorId: acc.id
        }
      });

      // Track Submission Analytics
      await prisma.acceleratorAnalytics.create({
        data: {
          acceleratorId: acc.id,
          eventType: 'submission',
          metadata: { leadId: lead.id },
          ipAddress: req.ip || 'unknown'
        }
      });

      return res.status(201).json({ 
        success: true, 
        message: "Data synced successfully with Laps Cloud." 
      });
    } catch (error: any) {
      console.error("Submission Error:", error);
      return res.status(500).json({ 
        error: "Sync Failed", 
        message: "Form submission failed due to a server-side error." 
      });
    }
  }
}