
// ============================================================================
// src/services/email/gmail.service.ts
// ============================================================================
import { google } from 'googleapis';
import { logger } from '../../utils/logger';

export class GmailService {
  async send(params: {
    accessToken: string;
    to: string;
    subject: string;
    body: string;
  }) {
    const { accessToken, to, subject, body } = params;

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      body,
    ].join('\n');

    const encodedMessage = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      messageId: response.data.id!,
      threadId: response.data.threadId!,
    };
  }

  async fetchRecent(accessToken: string, maxResults: number = 50) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox is:unread',
    });

    const messages = response.data.messages || [];
    const results = [];

    for (const message of messages) {
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full',
      });

      const headers = details.data.payload?.headers || [];
      const from = headers.find((h) => h.name === 'From')?.value || '';
      const subject = headers.find((h) => h.name === 'Subject')?.value || '';
      const inReplyTo = headers.find((h) => h.name === 'In-Reply-To')?.value;

      const body = this.extractBody(details.data.payload);

      results.push({
        messageId: details.data.id!,
        threadId: details.data.threadId!,
        from: this.extractEmail(from),
        subject,
        body,
        inReplyTo,
        receivedAt: new Date(parseInt(details.data.internalDate!) / 1000),
      });
    }

    return results;
  }

  private extractBody(payload: any): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
          if (part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
        if (part.parts) {
          const body = this.extractBody(part);
          if (body) return body;
        }
      }
    }

    return '';
  }

  private extractEmail(from: string): string {
    const match = from.match(/<(.+?)>/);
    return match ? match[1] : from;
  }
}
