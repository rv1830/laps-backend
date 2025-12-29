import { prisma } from '../../config/database';
import { EmailOrchestrator } from '../email/email-orchestrator.service';

export class SequenceEngine {
  async processEnrollments() {
    // Get all active enrollments
    const enrollments = await prisma.sequenceEnrollment.findMany({
      where: { status: 'active' },
      include: {
        lead: true,
        sequence: {
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        },
      },
    });

    for (const enrollment of enrollments) {
      try {
        await this.processEnrollment(enrollment);
      } catch (error) {
        console.error(`Error processing enrollment ${enrollment.id}:`, error);
      }
    }
  }

  private async processEnrollment(enrollment: any) {
    const { sequence, lead, currentStep } = enrollment;
    const steps = sequence.steps;

    if (currentStep >= steps.length) {
      // Sequence complete
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      return;
    }

    const step = steps[currentStep];

    if (step.stepType === 'email') {
      await this.sendSequenceEmail(enrollment, step);
    } else if (step.stepType === 'delay') {
      await this.handleDelay(enrollment, step);
    } else if (step.stepType === 'condition') {
      await this.handleCondition(enrollment, step);
    }
  }

  private async sendSequenceEmail(enrollment: any, step: any) {
    const { lead, sequence } = enrollment;

    // Check automation mode
    if (sequence.automationMode === 'manual') {
      // Create task for manual sending
      await prisma.task.create({
        data: {
          workspaceId: sequence.workspaceId,
          leadId: lead.id,
          title: `Send sequence email: ${step.subject}`,
          type: 'send_email',
          metadata: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            subject: step.subject,
            body: step.body,
          },
        },
      });
      return;
    }

    const orchestrator = new EmailOrchestrator();

    // Replace variables
    const subject = this.replaceVariables(step.subject, lead);
    const body = this.replaceVariables(step.body, lead);

    if (sequence.automationMode === 'assisted') {
      // Create approval request
      await prisma.approvalRequest.create({
        data: {
          workspaceId: sequence.workspaceId,
          type: 'email_send',
          entityType: 'sequence_email',
          entityId: enrollment.id,
          requestedBy: 'system',
          status: 'pending',
          data: {
            leadId: lead.id,
            subject,
            body,
            enrollmentId: enrollment.id,
            stepNumber: step.stepNumber,
          },
        },
      });
      return;
    }

    // Autopilot mode - send directly
    await orchestrator.sendEmail({
      workspaceId: sequence.workspaceId,
      leadId: lead.id,
      subject,
      body,
    });

    // Move to next step
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentStep: { increment: 1 },
        emailsSent: { increment: 1 },
      },
    });
  }

  private async handleDelay(enrollment: any, step: any) {
    // Delays are handled by scheduled jobs
    // Just mark this step as complete and move forward
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { currentStep: { increment: 1 } },
    });
  }

  private async handleCondition(enrollment: any, step: any) {
    // Evaluate condition and branch
    const passed = true; // Simplified - implement actual condition logic
    
    if (passed) {
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { currentStep: { increment: 1 } },
      });
    } else {
      // Skip to alternate path or complete
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'completed', completedAt: new Date() },
      });
    }
  }

  private replaceVariables(template: string, lead: any): string {
    const variables: Record<string, any> = {
      first_name: lead.firstName || '',
      last_name: lead.lastName || '',
      full_name: lead.fullName || '',
      company: lead.company || '',
      email: lead.email || '',
    };

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }
}