// ============================================================================
// src/services/calendar/outlook-calendar.service.ts
// ============================================================================
import axios from 'axios';

export class OutlookCalendarService {
  async createEvent(params: {
    accessToken: string;
    subject: string;
    body?: string;
    startTime: Date;
    endTime: Date;
    attendees?: string[];
    isOnlineMeeting?: boolean;
  }) {
    const { accessToken, subject, body, startTime, endTime, attendees, isOnlineMeeting } = params;

    const event: any = {
      subject,
      body: body ? { contentType: 'HTML', content: body } : undefined,
      start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
      isOnlineMeeting: isOnlineMeeting || false,
    };

    if (attendees && attendees.length > 0) {
      event.attendees = attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required',
      }));
    }

    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/events',
      event,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return {
      eventId: response.data.id,
      meetingUrl: response.data.onlineMeeting?.joinUrl,
    };
  }

  async updateEvent(params: {
    accessToken: string;
    eventId: string;
    updates: any;
  }) {
    const { accessToken, eventId, updates } = params;

    const response = await axios.patch(
      `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
      updates,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return response.data;
  }

  async deleteEvent(accessToken: string, eventId: string) {
    await axios.delete(
      `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  }

  async getAvailability(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
  }) {
    const { accessToken, startDate, endDate } = params;

    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
      {
        schedules: ['me'],
        startTime: { dateTime: startDate.toISOString(), timeZone: 'UTC' },
        endTime: { dateTime: endDate.toISOString(), timeZone: 'UTC' },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return response.data.value[0].scheduleItems;
  }
}