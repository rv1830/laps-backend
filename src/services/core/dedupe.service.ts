
// ============================================================================
// src/services/core/dedupe.service.ts
// ============================================================================
import { prisma } from '../../app';

export class DedupeService {
  async findDuplicates(workspaceId: string, lead: {
    email?: string;
    phone?: string;
    fullName?: string;
    company?: string;
  }) {
    const potentialDuplicates = [];

    // Strong match on email
    if (lead.email) {
      const emailMatch = await prisma.lead.findFirst({
        where: {
          workspaceId,
          email: lead.email,
        },
      });
      if (emailMatch) potentialDuplicates.push({ lead: emailMatch, confidence: 'high', reason: 'email_match' });
    }

    // Strong match on phone
    if (lead.phone) {
      const phoneMatch = await prisma.lead.findFirst({
        where: {
          workspaceId,
          phone: lead.phone,
        },
      });
      if (phoneMatch) potentialDuplicates.push({ lead: phoneMatch, confidence: 'high', reason: 'phone_match' });
    }

    // Weak match on name + company
    if (lead.fullName && lead.company) {
      const nameCompanyMatch = await prisma.lead.findFirst({
        where: {
          workspaceId,
          fullName: { contains: lead.fullName, mode: 'insensitive' },
          company: { contains: lead.company, mode: 'insensitive' },
        },
      });
      if (nameCompanyMatch) potentialDuplicates.push({ lead: nameCompanyMatch, confidence: 'medium', reason: 'name_company_match' });
    }

    return potentialDuplicates;
  }

  async mergeLeads(primaryId: string, duplicateId: string) {
    const primary = await prisma.lead.findUnique({ where: { id: primaryId } });
    const duplicate = await prisma.lead.findUnique({ where: { id: duplicateId } });

    if (!primary || !duplicate) {
      throw new Error('Lead not found');
    }

    // Merge activities
    await prisma.activity.updateMany({
      where: { leadId: duplicateId },
      data: { leadId: primaryId },
    });

    // Merge tasks
    await prisma.task.updateMany({
      where: { leadId: duplicateId },
      data: { leadId: primaryId },
    });

    // Merge emails
    await prisma.emailMessage.updateMany({
      where: { leadId: duplicateId },
      data: { leadId: primaryId },
    });

    // Merge meetings
    await prisma.meeting.updateMany({
      where: { leadId: duplicateId },
      data: { leadId: primaryId },
    });

    // Merge custom fields (keep non-null values from duplicate)
    const mergedCustomFields = {
      ...(primary.customFields as Record<string, any> ?? {}),
      ...(duplicate.customFields as Record<string, any> ?? {}),
    };

    // Update primary lead
    await prisma.lead.update({
      where: { id: primaryId },
      data: {
        phone: primary.phone || duplicate.phone,
        company: primary.company || duplicate.company,
        jobTitle: primary.jobTitle || duplicate.jobTitle,
        website: primary.website || duplicate.website,
        customFields: mergedCustomFields,
      },
    });

    // Delete duplicate
    await prisma.lead.delete({ where: { id: duplicateId } });

    return primary;
  }
}


