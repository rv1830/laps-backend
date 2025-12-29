import { prisma } from '../../config/database';
import { EmailOrchestrator } from '../email/email-orchestrator.service';

export class WorkflowEngine {
  async executeWorkflow(workflowId: string, triggerData: any) {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow || !workflow.isActive) {
      throw new Error('Workflow not found or inactive');
    }

    // Create workflow run
    const run = await prisma.workflowRun.create({
      data: {
        workspaceId: workflow.workspaceId,
        workflowId,
        status: 'running',
        triggerData,
        executionLog: [],
      },
    });

    try {
      const definition = workflow.definition as any;
      const log: any[] = [];

      // Execute trigger
      log.push({
        step: 'trigger',
        type: workflow.triggerType,
        data: triggerData,
        timestamp: new Date(),
      });

      // Evaluate conditions
      const conditionsPassed = this.evaluateConditions(
        definition.conditions || [],
        triggerData
      );

      if (!conditionsPassed) {
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            executionLog: log,
          },
        });
        return;
      }

      // Execute actions
      for (const action of definition.actions || []) {
        try {
          const result = await this.executeAction(
            action,
            triggerData,
            workflow.workspaceId
          );

          log.push({
            step: 'action',
            type: action.type,
            result,
            timestamp: new Date(),
          });

          // Check if approval needed
          if (
            workflow.automationMode === 'assisted' &&
            this.requiresApproval(action.type)
          ) {
            await this.createApprovalRequest(workflow.workspaceId, action, triggerData);
            
            await prisma.workflowRun.update({
              where: { id: run.id },
              data: {
                status: 'waiting_approval',
                executionLog: log,
              },
            });
            return;
          }
        } catch (error: any) {
          log.push({
            step: 'action',
            type: action.type,
            error: error.message,
            timestamp: new Date(),
          });

          if (action.continueOnError !== true) {
            throw error;
          }
        }
      }

      // Mark complete
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          executionLog: log,
        },
      });

      await prisma.workflow.update({
        where: { id: workflowId },
        data: { lastRunAt: new Date() },
      });
    } catch (error: any) {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: error.message,
        },
      });
      throw error;
    }
  }

  private evaluateConditions(conditions: any[], data: any): boolean {
    if (conditions.length === 0) return true;

    return conditions.every((condition) => {
      const { field, operator, value } = condition;
      const fieldValue = this.getNestedValue(data, field);

      switch (operator) {
        case 'equals':
          return fieldValue === value;
        case 'not_equals':
          return fieldValue !== value;
        case 'contains':
          return String(fieldValue).includes(value);
        case 'greater_than':
          return Number(fieldValue) > Number(value);
        case 'less_than':
          return Number(fieldValue) < Number(value);
        case 'exists':
          return fieldValue !== null && fieldValue !== undefined;
        default:
          return false;
      }
    });
  }

  private async executeAction(action: any, triggerData: any, workspaceId: string) {
    switch (action.type) {
      case 'send_email':
        return await this.actionSendEmail(action, triggerData, workspaceId);
      
      case 'enroll_sequence':
        return await this.actionEnrollSequence(action, triggerData, workspaceId);
      
      case 'create_task':
        return await this.actionCreateTask(action, triggerData, workspaceId);
      
      case 'change_stage':
        return await this.actionChangeStage(action, triggerData, workspaceId);
      
      case 'generate_proposal':
        return await this.actionGenerateProposal(action, triggerData, workspaceId);
      
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async actionSendEmail(action: any, triggerData: any, workspaceId: string) {
    const orchestrator = new EmailOrchestrator();
    
    const subject = this.replaceVariables(action.subject, triggerData);
    const body = this.replaceVariables(action.body, triggerData);

    return await orchestrator.sendEmail({
      workspaceId,
      leadId: triggerData.leadId,
      subject,
      body,
    });
  }

  private async actionEnrollSequence(action: any, triggerData: any, workspaceId: string) {
    const { sequenceId } = action;
    const { leadId } = triggerData;

    // Check if already enrolled
    const existing = await prisma.sequenceEnrollment.findUnique({
      where: { sequenceId_leadId: { sequenceId, leadId } },
    });

    if (existing) {
      throw new Error('Lead already enrolled in sequence');
    }

    return await prisma.sequenceEnrollment.create({
      data: {
        sequenceId,
        leadId,
        status: 'active',
      },
    });
  }

  private async actionCreateTask(action: any, triggerData: any, workspaceId: string) {
    const title = this.replaceVariables(action.title, triggerData);
    const description = this.replaceVariables(action.description || '', triggerData);

    return await prisma.task.create({
      data: {
        workspaceId,
        leadId: triggerData.leadId,
        title,
        description,
        type: action.taskType || 'follow_up',
        priority: action.priority || 'medium',
        dueAt: action.dueInDays
          ? new Date(Date.now() + action.dueInDays * 24 * 60 * 60 * 1000)
          : null,
      },
    });
  }

  private async actionChangeStage(action: any, triggerData: any, workspaceId: string) {
    const { stageId } = action;
    const { leadId } = triggerData;

    return await prisma.lead.update({
      where: { id: leadId },
      data: { stageId },
    });
  }

  private async actionGenerateProposal(action: any, triggerData: any, workspaceId: string) {
    // Simplified proposal generation
    // In production, this would integrate with AI to generate content
    
    return await prisma.proposal.create({
      data: {
        workspaceId,
        leadId: triggerData.leadId,
        title: `Proposal for ${triggerData.leadName}`,
        content: {},
        lineItems: [],
        subtotal: 0,
        total: 0,
        status: 'draft',
      },
    });
  }

  private requiresApproval(actionType: string): boolean {
    const approvalRequired = [
      'send_email',
      'change_stage',
      'generate_proposal',
      'generate_invoice',
    ];
    return approvalRequired.includes(actionType);
  }

  private async createApprovalRequest(
    workspaceId: string,
    action: any,
    triggerData: any
  ) {
    await prisma.approvalRequest.create({
      data: {
        workspaceId,
        type: action.type,
        entityType: 'workflow_action',
        entityId: action.id,
        requestedBy: 'system',
        status: 'pending',
        data: { action, triggerData },
      },
    });
  }

  private replaceVariables(template: string, data: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return this.getNestedValue(data, key) || match;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}