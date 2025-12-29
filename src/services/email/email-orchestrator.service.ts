// ============================================================================
// src/services/email/email-orchestrator.service.ts
// ============================================================================
import { prisma } from '../../app';
import { GmailService } from './gmail.service';
import { OutlookService } from './outlook.service';

export class EmailOrchestrator {
  private gmailService: GmailService;
  private outlookService: OutlookService;

  constructor() {
    this.gmailService = new GmailService();
    this.outlookService = new OutlookService();
  }

  async sendEmail(params: {
    workspaceId: string;
    leadId: string;
    subject: string;
    body: string;
    emailAccountId?: string;
  }) {
    const { workspaceId, leadId, subject, body, emailAccountId } = params;

    // Get lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { workspace: true },
    });

    if (!lead || !lead.email) {
      throw new Error('Lead email not found');
    }

    // Get email account
    let account;
    if (emailAccountId) {
      account = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
      });
    } else {
      account = await prisma.emailAccount.findFirst({
        where: { workspaceId, isActive: true },
      });
    }

    if (!account) {
      throw new Error('No active email account found');
    }

    // Check daily limit
    if (account.sentToday >= account.dailyLimit) {
      throw new Error('Daily email limit reached');
    }

    // Check suppression list
    const suppressed = await prisma.suppressionList.findUnique({
      where: { workspaceId_email: { workspaceId, email: lead.email } },
    });

    if (suppressed) {
      throw new Error(`Email suppressed: ${suppressed.reason}`);
    }

    // Send via appropriate provider
    let result;
    if (account.provider === 'gmail') {
      result = await this.gmailService.send({
        accessToken: account.accessToken,
        to: lead.email,
        subject,
        body,
      });
    } else if (account.provider === 'outlook') {
      result = await this.outlookService.send({
        accessToken: account.accessToken,
        to: lead.email,
        subject,
        body,
      });
    } else {
      throw new Error('Unsupported email provider');
    }

    // Create email record
    const emailMessage = await prisma.emailMessage.create({
      data: {
        workspaceId,
        leadId,
        emailAccountId: account.id,
        direction: 'outbound',
        subject,
        body,
        messageId: result.messageId,
        threadId: result.threadId,
        status: 'sent',
        sentAt: new Date(),
      },
    });

    // Update account sent count
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { sentToday: { increment: 1 } },
    });

    // Update lead last contacted
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        lastContactedAt: new Date(),
        lastActivityAt: new Date(),
        firstContactAt: lead.firstContactAt || new Date(),
      },
    });

    // Create activity
    await prisma.activity.create({
      data: {
        workspaceId,
        leadId,
        type: 'email_sent',
        title: `Email sent: ${subject}`,
        metadata: { emailId: emailMessage.id },
      },
    });

    return emailMessage;
  }

  async syncInbox(emailAccountId: string) {
    const account = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
    });

    if (!account) {
      throw new Error('Email account not found');
    }

    let messages;
    if (account.provider === 'gmail') {
      messages = await this.gmailService.fetchRecent(account.accessToken);
    } else if (account.provider === 'outlook') {
      messages = await this.outlookService.fetchRecent(account.accessToken);
    } else {
      throw new Error('Unsupported provider');
    }

    // Process each message
    for (const msg of messages) {
      // Check if already exists
      const existing = await prisma.emailMessage.findUnique({
        where: { messageId: msg.messageId },
      });

      if (existing) continue;

      // Find lead by sender email
      const lead = await prisma.lead.findFirst({
        where: {
          workspaceId: account.workspaceId,
          email: msg.from,
        },
      });

      if (lead) {
        // Create inbound email record
        await prisma.emailMessage.create({
          data: {
            workspaceId: account.workspaceId,
            leadId: lead.id,
            emailAccountId: account.id,
            direction: 'inbound',
            subject: msg.subject,
            body: msg.body,
            messageId: msg.messageId,
            threadId: msg.threadId,
            inReplyTo: msg.inReplyTo,
            status: 'delivered',
            sentAt: msg.receivedAt,
          },
        });

        // Update lead
        await prisma.lead.update({
          where: { id: lead.id },
          data: { lastActivityAt: new Date() },
        });

        // Create activity
        await prisma.activity.create({
          data: {
            workspaceId: account.workspaceId,
            leadId: lead.id,
            type: 'email_received',
            title: `Reply received: ${msg.subject}`,
          },
        });

        // Stop active sequences
        await prisma.sequenceEnrollment.updateMany({
          where: { leadId: lead.id, status: 'active' },
          data: { status: 'stopped', stoppedAt: new Date() },
        });
      }
    }

    // Update sync timestamp
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { lastSyncAt: new Date() },
    });
  }
}
