import * as cron from 'node-cron';
import { storage } from '../storage';
// We'll need to define executeTaskAsync here or import it properly

export class SchedulerService {
  private scheduledJobs: Map<number, cron.ScheduledTask> = new Map();

  constructor() {
    this.initializeScheduler();
  }

  private async initializeScheduler() {
    console.log('Initializing scheduler service...');
    
    // Load all active scheduled tasks on startup
    await this.loadActiveScheduledTasks();
    
    // Check for updates every minute
    cron.schedule('* * * * *', async () => {
      await this.loadActiveScheduledTasks();
    });
  }

  private async loadActiveScheduledTasks() {
    try {
      const activeTasks = await storage.getActiveScheduledTasks();
      
      // Remove tasks that are no longer active
      for (const [taskId, job] of this.scheduledJobs) {
        const isStillActive = activeTasks.some(task => task.id === taskId);
        if (!isStillActive) {
          job.stop();
          this.scheduledJobs.delete(taskId);
          console.log(`Stopped scheduled task ${taskId}`);
        }
      }

      // Add or update active tasks
      for (const task of activeTasks) {
        if (task.cronExpression) {
          this.scheduleTask(task);
        }
      }
    } catch (error) {
      console.error('Error loading scheduled tasks:', error);
    }
  }

  private scheduleTask(task: any) {
    try {
      // Stop existing job if it exists
      if (this.scheduledJobs.has(task.id)) {
        this.scheduledJobs.get(task.id)?.stop();
      }

      // Validate cron expression
      if (!cron.validate(task.cronExpression)) {
        console.error(`Invalid cron expression for task ${task.id}: ${task.cronExpression}`);
        return;
      }

      // Create new scheduled job
      const scheduledJob = cron.schedule(
        task.cronExpression,
        async () => {
          await this.executeScheduledTask(task);
        },
        {
          scheduled: true,
          timezone: task.timezone || 'UTC',
        }
      );

      this.scheduledJobs.set(task.id, scheduledJob);
      
      // Update next run time
      await this.updateNextRunTime(task.id, task.cronExpression, task.timezone);
      
      console.log(`Scheduled task ${task.id} with expression: ${task.cronExpression}`);
    } catch (error) {
      console.error(`Error scheduling task ${task.id}:`, error);
    }
  }

  private async executeScheduledTask(scheduledTask: any) {
    try {
      console.log(`Executing scheduled task: ${scheduledTask.name} (ID: ${scheduledTask.id})`);

      // Create a new ERP task for execution
      const erpTask = await storage.createErpTask({
        connectionId: scheduledTask.workflow.connectionId,
        taskDescription: scheduledTask.workflow.description,
        userId: scheduledTask.userId,
        status: 'processing',
      });

      // Execute the task
      await executeTaskAsync(erpTask.id, scheduledTask.workflow.connection, scheduledTask.workflow.description);

      // Update scheduled task statistics
      await storage.updateScheduledTask(scheduledTask.id, {
        lastRun: new Date(),
        runCount: (scheduledTask.runCount || 0) + 1,
      });

      // Update next run time
      await this.updateNextRunTime(scheduledTask.id, scheduledTask.cronExpression, scheduledTask.timezone);

      console.log(`Successfully executed scheduled task ${scheduledTask.id}`);
    } catch (error) {
      console.error(`Error executing scheduled task ${scheduledTask.id}:`, error);
    }
  }

  private async updateNextRunTime(taskId: number, cronExpression: string, timezone: string = 'UTC') {
    try {
      // Calculate next run time based on cron expression
      const nextRun = this.getNextRunTime(cronExpression, timezone);
      
      await storage.updateScheduledTask(taskId, {
        nextRun,
      });
    } catch (error) {
      console.error(`Error updating next run time for task ${taskId}:`, error);
    }
  }

  private getNextRunTime(cronExpression: string, timezone: string = 'UTC'): Date {
    // This is a simplified calculation - in production you might want to use a proper cron parser
    // For now, we'll just add a reasonable interval based on common patterns
    const now = new Date();
    
    // Parse common cron patterns
    const parts = cronExpression.split(' ');
    if (parts.length >= 5) {
      const minute = parts[0];
      const hour = parts[1];
      const dayOfMonth = parts[2];
      const month = parts[3];
      const dayOfWeek = parts[4];

      // Handle common patterns
      if (minute !== '*' && hour !== '*') {
        // Daily at specific time
        const nextRun = new Date(now);
        nextRun.setHours(parseInt(hour), parseInt(minute), 0, 0);
        
        // If time has passed today, schedule for tomorrow
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        
        return nextRun;
      } else if (minute !== '*') {
        // Every hour at specific minute
        const nextRun = new Date(now);
        nextRun.setMinutes(parseInt(minute), 0, 0);
        
        // If minute has passed this hour, schedule for next hour
        if (nextRun <= now) {
          nextRun.setHours(nextRun.getHours() + 1);
        }
        
        return nextRun;
      }
    }

    // Default: add 1 hour
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  public async addScheduledTask(taskId: number) {
    const task = await storage.getScheduledTask(taskId);
    if (task && task.isActive && task.cronExpression) {
      // Get full task details with workflow and connection
      const tasks = await storage.getActiveScheduledTasks();
      const fullTask = tasks.find(t => t.id === taskId);
      if (fullTask) {
        this.scheduleTask(fullTask);
      }
    }
  }

  public removeScheduledTask(taskId: number) {
    const job = this.scheduledJobs.get(taskId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(taskId);
      console.log(`Removed scheduled task ${taskId}`);
    }
  }

  public getScheduledJobsCount(): number {
    return this.scheduledJobs.size;
  }
}

// Create and export singleton instance
export const schedulerService = new SchedulerService();