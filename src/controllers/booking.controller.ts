// ============================================================================
// src/controllers/booking.controller.ts
// ============================================================================
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../app';
import { GoogleCalendarService } from '../services/calendar/google-calendar.service';
import { OutlookCalendarService } from '../services/calendar/outlook-calendar.service';

export class BookingController {
  async createBookingLink(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req;
      const {
        name,
        meetingType,
        duration,
        description,
        availability,
        location,
        questions,
      } = req.body;

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const bookingLink = await prisma.bookingLink.create({
        data: {
          workspaceId: workspaceId!,
          name,
          slug,
          meetingType,
          duration,
          description,
          availability: availability || {},
          location: location || 'google_meet',
          questions: questions || [],
        },
      });

      res.status(201).json(bookingLink);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getBookingPage(req: Request, res: Response) {
    try {
      const { slug } = req.params;

      const bookingLink = await prisma.bookingLink.findUnique({
        where: { slug },
        include: { workspace: true },
      });

      if (!bookingLink || !bookingLink.isActive) {
        return res.status(404).json({ error: 'Booking link not found' });
      }

      res.json(bookingLink);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async bookMeeting(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const { leadEmail, leadName, startTime, answers } = req.body;

      const bookingLink = await prisma.bookingLink.findUnique({
        where: { slug },
      });

      if (!bookingLink || !bookingLink.isActive) {
        return res.status(404).json({ error: 'Booking link not found' });
      }

      // Find or create lead
      let lead = await prisma.lead.findFirst({
        where: {
          workspaceId: bookingLink.workspaceId,
          email: leadEmail,
        },
      });

      if (!lead) {
        const defaultStage = await prisma.stage.findFirst({
          where: { workspaceId: bookingLink.workspaceId, order: 0 },
        });

        lead = await prisma.lead.create({
          data: {
            workspaceId: bookingLink.workspaceId,
            email: leadEmail,
            fullName: leadName,
            source: 'booking',
            stageId: defaultStage!.id,
          },
        });
      }

      // Get calendar integration
      const integration = await prisma.integration.findFirst({
        where: {
          workspaceId: bookingLink.workspaceId,
          type: 'calendar',
          isActive: true,
        },
      });

      if (!integration) {
        return res.status(400).json({ error: 'Calendar not connected' });
      }

      const credentials = integration.credentials as any;
      const endTime = new Date(new Date(startTime).getTime() + bookingLink.duration * 60000);

      let eventId, meetingUrl;

      if (integration.provider === 'google') {
        const calendarService = new GoogleCalendarService();
        const event = await calendarService.createEvent({
          accessToken: credentials.accessToken,
          summary: `${bookingLink.name} - ${leadName}`,
          description: bookingLink.description || undefined,
          startTime: new Date(startTime),
          endTime,
          attendees: [leadEmail],
          conferenceData: bookingLink.location === 'google_meet',
        });
        eventId = event.eventId;
        meetingUrl = event.meetingUrl;
      } else if (integration.provider === 'microsoft') {
        const calendarService = new OutlookCalendarService();
        const event = await calendarService.createEvent({
          accessToken: credentials.accessToken,
          subject: `${bookingLink.name} - ${leadName}`,
          body: bookingLink.description ?? undefined,
          startTime: new Date(startTime),
          endTime,
          attendees: [leadEmail],
          isOnlineMeeting: bookingLink.location === 'teams',
        });
        eventId = event.eventId;
        meetingUrl = event.meetingUrl;
      }

      // Create meeting record
      const meeting = await prisma.meeting.create({
        data: {
          workspaceId: bookingLink.workspaceId,
          leadId: lead.id,
          bookingLinkId: bookingLink.id,
          title: `${bookingLink.name} - ${leadName}`,
          description: bookingLink.description,
          startTime: new Date(startTime),
          endTime,
          timezone: 'UTC',
          location: bookingLink.location,
          meetingUrl,
          googleEventId: integration.provider === 'google' ? eventId : undefined,
          outlookEventId: integration.provider === 'microsoft' ? eventId : undefined,
          answers: answers || {},
          status: 'scheduled',
        },
      });

      // Create activity
      await prisma.activity.create({
        data: {
          workspaceId: bookingLink.workspaceId,
          leadId: lead.id,
          type: 'meeting_booked',
          title: `Meeting booked: ${bookingLink.name}`,
          metadata: { meetingId: meeting.id },
        },
      });

      // Update lead stage (optional - based on workflow)

      res.status(201).json({
        meeting,
        message: 'Meeting booked successfully',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}