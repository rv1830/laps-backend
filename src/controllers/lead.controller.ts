// ============================================================================
// src/controllers/lead.controller.ts
// ============================================================================
import { Request, Response } from 'express';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth.middleware';

export class LeadController {
  
  // Create Lead
  async createLead(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const { email, phone, firstName, lastName, company, source, stageId, customFields } = req.body;

      if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
      }

      if (email) {
        const existing = await prisma.lead.findUnique({
          where: { workspaceId_email: { workspaceId: workspaceId!, email } },
        });

        if (existing) {
          return res.status(409).json({ error: 'Lead already exists', lead: existing });
        }
      }

      let finalStageId = stageId;
      if (!finalStageId) {
        const defaultStage = await prisma.stage.findFirst({
          where: { workspaceId: workspaceId! },
          orderBy: { order: 'asc' },
        });
        
        if (!defaultStage) {
            return res.status(400).json({ error: 'No pipeline stages found. Please ensure workspace is initialized correctly.' });
        }
        
        finalStageId = defaultStage?.id;
      }

      const fullName = `${firstName || ''} ${lastName || ''}`.trim() || email || phone || 'Unknown';

      const lead = await prisma.lead.create({
        data: {
          workspaceId: workspaceId!, 
          stageId: finalStageId,     
          ownerId: req.user?.id || null, 
          
          email,
          phone,
          firstName,
          lastName,
          fullName,
          company,
          source,
          customFields: customFields || {}
        },
      });

      await prisma.activity.create({
        data: {
          type: 'lead_created',
          title: 'Lead created',
          metadata: { source },
          workspaceId: workspaceId!, 
          leadId: lead.id,
          userId: req.user?.id || null
        },
      });

      res.status(201).json(lead);
    } catch (error: any) {
      console.error("Create Lead Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get Leads (Optimized with Total Counts)
  async getLeads(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const { 
        page = 1, 
        limit = 50, 
        search, 
        stageId, 
        source, 
        ownerId,
        moodLabel 
      } = req.query;

      const where: any = { workspaceId };

      if (search) {
        where.OR = [
          { fullName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { company: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (stageId && stageId !== 'all') {
        const isUuid = (stageId as string).length > 20;
        if (!isUuid) {
          const resolvedStage = await prisma.stage.findFirst({
            where: {
              workspaceId: workspaceId!,
              name: { equals: stageId as string, mode: 'insensitive' }
            }
          });
          where.stageId = resolvedStage ? resolvedStage.id : 'none';
        } else {
          where.stageId = stageId;
        }
      }

      if (source && source !== 'all') {
        where.source = { equals: source as string, mode: 'insensitive' };
      }

      if (moodLabel && moodLabel !== 'all') {
        where.moodLabel = { equals: moodLabel as string, mode: 'insensitive' };
      }

      if (ownerId && ownerId !== 'all') {
        where.ownerId = ownerId;
      }

      const [leads, totalCount] = await Promise.all([
        prisma.lead.findMany({
          where,
          include: {
            stage: true,
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
        }),
        prisma.lead.count({ where }),
      ]);

      res.json({
        leads,
        totalCount,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / Number(limit)),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch leads. Please try again later." });
    }
  }

  // Get Single Lead
  async getLead(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const { leadId } = req.params;

      const lead = await prisma.lead.findFirst({
        where: { id: leadId, workspaceId: workspaceId! },
        include: {
          stage: true,
          owner: true,
          activities: { orderBy: { createdAt: 'desc' }, take: 50 },
          tasks: { where: { status: { not: 'completed' } }, orderBy: { dueAt: 'asc' } },
          emails: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });

      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Update Lead
  async updateLead(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const { leadId } = req.params;
      const updates = { ...req.body };

      const lead = await prisma.lead.findFirst({
        where: { id: leadId, workspaceId: workspaceId! },
      });

      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      if (updates.stageId) {
        const targetStage = await prisma.stage.findFirst({
          where: { 
            workspaceId: workspaceId!,
            name: { equals: updates.stageId, mode: 'insensitive' } 
          }
        });

        if (targetStage) {
          updates.stageId = targetStage.id;
        } else {
          const isUuid = (updates.stageId as string).length > 20;
          if (!isUuid) {
            return res.status(400).json({ error: `Invalid stage name: ${updates.stageId}` });
          }
        }
      }

      if (updates.stageId && updates.stageId !== lead.stageId) {
        await prisma.activity.create({
          data: {
            type: 'stage_changed',
            title: 'Stage changed',
            metadata: { oldStageId: lead.stageId, newStageId: updates.stageId },
            workspaceId: workspaceId!,
            leadId: leadId,
            userId: req.user?.id || null
          },
        });
      }

      const updated = await prisma.lead.update({
        where: { id: leadId },
        data: updates,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Update Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Import Leads (Optimized with Dual-Identifier Duplicate Checking)
  async importLeads(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const { leads } = req.body;

      if (!Array.isArray(leads)) {
        return res.status(400).json({ error: 'Invalid data format. Please provide an array of leads.' });
      }

      const defaultStage = await prisma.stage.findFirst({
        where: { workspaceId: workspaceId! },
        orderBy: { order: 'asc' },
      });

      if (!defaultStage) {
        return res.status(400).json({ error: 'No pipeline stages found. Please initialize workspace stages first.' });
      }

      // Pre-fetch existing leads to check for duplicates in one go
      const emailsToCheck = leads.map(l => l.email).filter(Boolean);
      const phonesToCheck = leads.map(l => l.phone).filter(Boolean);

      const [existingEmails, existingPhones] = await Promise.all([
        prisma.lead.findMany({
          where: { workspaceId: workspaceId!, email: { in: emailsToCheck } },
          select: { email: true }
        }),
        prisma.lead.findMany({
          where: { workspaceId: workspaceId!, phone: { in: phonesToCheck } },
          select: { phone: true }
        })
      ]);

      const existingEmailSet = new Set(existingEmails.map(l => l.email));
      const existingPhoneSet = new Set(existingPhones.map(l => l.phone));

      const leadsToInsert = [];
      let skippedCount = 0;

      for (const leadData of leads) {
        // Validation line (if !email && !phone) removed.
        // Even leads with no identifiers will now be imported.

        // Check for duplicate identifiers (Email OR Phone)
        const isDuplicateEmail = leadData.email && existingEmailSet.has(leadData.email);
        const isDuplicatePhone = leadData.phone && existingPhoneSet.has(leadData.phone);

        if (isDuplicateEmail || isDuplicatePhone) {
          skippedCount++;
          continue;
        }

        const fullName = leadData.fullName || 
          `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim() || 
          leadData.email || 
          leadData.phone || 
          'Unknown Lead'; // Improved fallback name

        leadsToInsert.push({
          workspaceId: workspaceId!,
          stageId: leadData.stageId || defaultStage.id,
          ownerId: req.user?.id || null,
          email: leadData.email || null,
          phone: leadData.phone || null,
          firstName: leadData.firstName || null,
          lastName: leadData.lastName || null,
          fullName,
          company: leadData.company || null,
          source: leadData.source || 'import',
          customFields: leadData.customFields || {}
        });
      }

      // Batch Insert (Optimization for 1 Lakh+ records)
      const BATCH_SIZE = 5000;
      let importedCount = 0;

      for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
        const batch = leadsToInsert.slice(i, i + BATCH_SIZE);
        const result = await prisma.lead.createMany({
          data: batch,
          skipDuplicates: true,
        });
        importedCount += result.count;
      }

      res.json({
        success: true,
        message: 'Import process completed successfully.',
        imported: importedCount,
        skipped: skippedCount + (leadsToInsert.length - importedCount),
        total: leads.length
      });
    } catch (error: any) {
      console.error("Import Error:", error);
      res.status(500).json({ error: "An unexpected error occurred during lead import." });
    }
  }

  // Delete Lead
  async deleteLead(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const { leadId } = req.params;

      const lead = await prisma.lead.findFirst({
        where: { id: leadId, workspaceId: workspaceId! },
      });

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      await prisma.lead.delete({
        where: { id: leadId },
      });

      res.json({ message: 'Lead deleted successfully', id: leadId });
    } catch (error: any) {
      console.error("Delete Lead Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}