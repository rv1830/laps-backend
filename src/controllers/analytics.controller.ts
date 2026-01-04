
// ============================================================================
// src/controllers/analytics.controller.ts
// ============================================================================
import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { Stage } from '@prisma/client';
export class AnalyticsController {
    async getFunnelMetrics(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const { startDate, endDate } = req.query;

            const dateFilter: any = {};
            if (startDate) dateFilter.gte = new Date(startDate as string);
            if (endDate) dateFilter.lte = new Date(endDate as string);

            const where: any = { workspaceId };
            if (Object.keys(dateFilter).length) where.createdAt = dateFilter;

            // Get stage distribution
            const stages = await prisma.stage.findMany({
                where: { workspaceId: workspaceId! },
                orderBy: { order: 'asc' },
            });

            const funnelData = await Promise.all(
                stages.map(async (stage: Stage) => {
                    const count = await prisma.lead.count({
                        where: { ...where, stageId: stage.id },
                    });
                    return { stage: stage.name, count };
                })
            );

            // Key metrics
            const [
                totalLeads,
                contacted,
                replied,
                meetingsBooked,
                meetingsCompleted,
                proposalsSent,
                invoicesSent,
                won,
                lost,
            ] = await Promise.all([
                prisma.lead.count({ where }),
                prisma.lead.count({ where: { ...where, firstContactAt: { not: null } } }),
                prisma.emailMessage.count({
                    where: { workspaceId: workspaceId!, direction: 'inbound', sentAt: dateFilter },
                }),
                prisma.meeting.count({
                    where: { workspaceId: workspaceId!, status: 'scheduled', createdAt: dateFilter },
                }),
                prisma.meeting.count({
                    where: { workspaceId: workspaceId!, status: 'completed', completedAt: dateFilter },
                }),
                prisma.proposal.count({
                    where: { workspaceId: workspaceId!, sentAt: dateFilter },
                }),
                prisma.invoice.count({
                    where: { workspaceId: workspaceId!, sentAt: dateFilter },
                }),
                prisma.lead.count({
                    where: { ...where, stage: { isWon: true } },
                }),
                prisma.lead.count({
                    where: { ...where, stage: { isClosed: true, isWon: false } },
                }),
            ]);

            res.json({
                funnel: funnelData,
                metrics: {
                    totalLeads,
                    contacted,
                    replied,
                    meetingsBooked,
                    meetingsCompleted,
                    proposalsSent,
                    invoicesSent,
                    won,
                    lost,
                    conversionRates: {
                        leadToContact: totalLeads ? (contacted / totalLeads) * 100 : 0,
                        contactToReply: contacted ? (replied / contacted) * 100 : 0,
                        replyToMeeting: replied ? (meetingsBooked / replied) * 100 : 0,
                        meetingToProposal: meetingsCompleted ? (proposalsSent / meetingsCompleted) * 100 : 0,
                        proposalToWon: proposalsSent ? (won / proposalsSent) * 100 : 0,
                    },
                },
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSourceMetrics(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const { startDate, endDate } = req.query;

            const dateFilter: any = {};
            if (startDate) dateFilter.gte = new Date(startDate as string);
            if (endDate) dateFilter.lte = new Date(endDate as string);

            const where: any = { workspaceId };
            if (Object.keys(dateFilter).length) where.createdAt = dateFilter;

            const sourceData = await prisma.lead.groupBy({
                by: ['source'],
                where,
                _count: true,
            });

            res.json({
                sources: sourceData.map((s) => ({
                    source: s.source || 'unknown',
                    count: s._count,
                })),
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getEmailMetrics(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const { startDate, endDate } = req.query;

            const dateFilter: any = {};
            if (startDate) dateFilter.gte = new Date(startDate as string);
            if (endDate) dateFilter.lte = new Date(endDate as string);

            const where: any = { workspaceId, direction: 'outbound' };
            if (Object.keys(dateFilter).length) where.sentAt = dateFilter;

            const [sent, delivered, opened, clicked, replied, bounced] = await Promise.all([
                prisma.emailMessage.count({ where }),
                prisma.emailMessage.count({ where: { ...where, deliveredAt: { not: null } } }),
                prisma.emailMessage.count({ where: { ...where, openedAt: { not: null } } }),
                prisma.emailMessage.count({ where: { ...where, clickedAt: { not: null } } }),
                prisma.emailMessage.count({ where: { ...where, repliedAt: { not: null } } }),
                prisma.emailMessage.count({ where: { ...where, status: 'bounced' } }),
            ]);

            res.json({
                sent,
                delivered,
                opened,
                clicked,
                replied,
                bounced,
                rates: {
                    deliveryRate: sent ? (delivered / sent) * 100 : 0,
                    openRate: delivered ? (opened / delivered) * 100 : 0,
                    clickRate: opened ? (clicked / opened) * 100 : 0,
                    replyRate: sent ? (replied / sent) * 100 : 0,
                    bounceRate: sent ? (bounced / sent) * 100 : 0,
                },
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}