
// ============================================================================
// src/services/email/outlook.service.ts
// ============================================================================
import axios from 'axios';

export class OutlookService {
  async send(params: {
    accessToken: string;
    to: string;
    subject: string;
    body: string;
  }) {
    const { accessToken, to, subject, body } = params;

    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      {
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: body,
          },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      messageId: response.headers['x-ms-request-id'] || Date.now().toString(),
      threadId: response.headers['x-ms-request-id'] || Date.now().toString(),
    };
  }

  async fetchRecent(accessToken: string, maxResults: number = 50) {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}&$filter=isRead eq false`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return response.data.value.map((msg: any) => ({
      messageId: msg.id,
      threadId: msg.conversationId,
      from: msg.from.emailAddress.address,
      subject: msg.subject,
      body: msg.body.content,
      inReplyTo: msg.internetMessageId,
      receivedAt: new Date(msg.receivedDateTime),
    }));
  }
}
