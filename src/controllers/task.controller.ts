import { Response } from 'express';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth.middleware';

export class TaskController {
  // 1. Naya Task create karna
  async createTask(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req.params; // URL params se liya
      const { leadId, title, description, type, priority, dueAt, assignedTo } = req.body;

      if (!leadId || !title) {
        return res.status(400).json({ error: "Lead ID and Title are required" });
      }

      const task = await prisma.task.create({
        data: {
          workspaceId,
          leadId,
          title,
          description,
          type,
          priority: priority || 'medium',
          status: 'pending',
          dueAt: dueAt ? new Date(dueAt) : null,
          assignedTo: assignedTo || req.user?.id,
        },
        include: {
          lead: { select: { fullName: true } },
          assignee: { select: { firstName: true, lastName: true } }
        }
      });

      await prisma.activity.create({
        data: {
          workspaceId,
          leadId,
          userId: req.user?.id,
          type: 'task_created',
          title: `Task Assigned: ${title}`,
          description: `Priority: ${priority}, Due: ${dueAt || 'No deadline'}`
        }
      });

      res.status(201).json(task);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // 2. Tasks ki list lena
  async getTasks(req: AuthRequest, res: Response) {
    try {
      const { workspaceId } = req.params; // URL params se liya
      const { status, priority, leadId, assignedTo } = req.query;

      const tasks = await prisma.task.findMany({
        where: {
          workspaceId,
          ...(status && { status: String(status) }),
          ...(priority && { priority: String(priority) }),
          ...(leadId && { leadId: String(leadId) }),
          ...(assignedTo && { assignedTo: String(assignedTo) }),
        },
        include: {
          lead: {
            select: { id: true, fullName: true, email: true, moodScore: true }
          },
          assignee: {
            select: { id: true, firstName: true, lastName: true, avatar: true }
          }
        },
        orderBy: { dueAt: 'asc' }
      });

      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // 3. Task Update karna
  async updateTask(req: AuthRequest, res: Response) {
    try {
      const { id, workspaceId } = req.params; // URL se dono Params liye
      const { status, title, description, priority, dueAt, assignedTo } = req.body;

      const data: any = {
        title,
        description,
        priority,
        assignedTo,
        status,
        dueAt: dueAt ? new Date(dueAt) : undefined,
      };

      if (status === 'completed') {
        data.completedAt = new Date();
      }

      const updatedTask = await prisma.task.update({
        where: { id, workspaceId }, // Security check: task usi workspace ka hona chahiye
        data,
        include: { lead: true }
      });

      if (status === 'completed') {
        await prisma.activity.create({
          data: {
            workspaceId,
            leadId: updatedTask.leadId,
            userId: req.user?.id,
            type: 'task_completed',
            title: `Task Completed: ${updatedTask.title}`,
          }
        });
      }

      res.json(updatedTask);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // 4. Task Delete karna
  async deleteTask(req: AuthRequest, res: Response) {
    try {
      const { id, workspaceId } = req.params;
      await prisma.task.delete({ 
        where: { id, workspaceId } 
      });
      res.json({ message: "Task deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}