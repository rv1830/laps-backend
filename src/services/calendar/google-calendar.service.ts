// ============================================================================
// src/services/calendar/google-calendar.service.ts
// ============================================================================
import { google } from 'googleapis';
import { prisma } from '../../app';

export class GoogleCalendarService {
  async createEvent(params: {
    accessToken: string;
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendees?: string[];
    conferenceData?: boolean;
  }) {
    const { accessToken, summary, description, startTime, endTime, attendees, conferenceData } = params;

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event: any = {
      summary,
      description,
      start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
    };

    if (attendees && attendees.length > 0) {
      event.attendees = attendees.map(email => ({ email }));
    }

    if (conferenceData) {
      event.conferenceData = {
        createRequest: { requestId: `meet-${Date.now()}` },
      };
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: conferenceData ? 1 : 0,
      sendUpdates: 'all',
    });

    return {
      eventId: response.data.id!,
      meetingUrl: response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri,
    };
  }

  async updateEvent(params: {
    accessToken: string;
    eventId: string;
    updates: any;
  }) {
    const { accessToken, eventId, updates } = params;

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: updates,
      sendUpdates: 'all',
    });

    return response.data;
  }

  async deleteEvent(accessToken: string, eventId: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });
  }

  async getAvailability(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
  }) {
    const { accessToken, startDate, endDate } = params;

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    return response.data.calendars?.primary?.busy || [];
  }
}















