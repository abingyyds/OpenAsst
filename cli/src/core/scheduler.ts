import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  schedule: string;  // Cron expression or interval
  command: string;
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
  nextRun?: string;
}

export class Scheduler {
  private configPath: string;
  private executor: CommandExecutor;

  constructor() {
    const configDir = path.join(os.homedir(), '.openasst-cli');
    this.configPath = path.join(configDir, 'schedules.json');
    this.executor = new CommandExecutor();
    this.ensureConfig();
  }

  private ensureConfig(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify({ tasks: [] }, null, 2));
    }
  }

  /**
   * Get all scheduled tasks
   */
  getTasks(): ScheduledTask[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      return data.tasks || [];
    } catch {
      return [];
    }
  }

  private saveTasks(tasks: ScheduledTask[]): void {
    fs.writeFileSync(this.configPath, JSON.stringify({ tasks }, null, 2));
  }

  /**
   * Create a new scheduled task
   */
  async createTask(task: Omit<ScheduledTask, 'id' | 'createdAt'>): Promise<ScheduledTask> {
    const tasks = this.getTasks();

    const newTask: ScheduledTask = {
      ...task,
      id: `task_${Date.now()}`,
      createdAt: new Date().toISOString()
    };

    // Install cron job
    if (task.enabled) {
      await this.installCronJob(newTask);
    }

    tasks.push(newTask);
    this.saveTasks(tasks);

    Logger.success(`Task "${newTask.name}" created`);
    return newTask;
  }

  /**
   * Delete a scheduled task
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const tasks = this.getTasks();
    const index = tasks.findIndex(t => t.id === taskId);

    if (index === -1) {
      Logger.error(`Task "${taskId}" not found`);
      return false;
    }

    const task = tasks[index];
    await this.removeCronJob(task);

    tasks.splice(index, 1);
    this.saveTasks(tasks);

    Logger.success(`Task "${task.name}" deleted`);
    return true;
  }

  /**
   * Enable/disable a task
   */
  async toggleTask(taskId: string, enabled: boolean): Promise<boolean> {
    const tasks = this.getTasks();
    const task = tasks.find(t => t.id === taskId);

    if (!task) {
      Logger.error(`Task "${taskId}" not found`);
      return false;
    }

    if (enabled) {
      await this.installCronJob(task);
    } else {
      await this.removeCronJob(task);
    }

    task.enabled = enabled;
    this.saveTasks(tasks);

    Logger.success(`Task "${task.name}" ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  private async installCronJob(task: ScheduledTask): Promise<void> {
    const cronLine = `${task.schedule} ${task.command} # openasst:${task.id}`;

    // Get current crontab
    const result = await this.executor.execute('crontab -l 2>/dev/null || echo ""');
    let crontab = result.output || '';

    // Remove existing entry if any
    crontab = crontab.split('\n')
      .filter(line => !line.includes(`openasst:${task.id}`))
      .join('\n');

    // Add new entry
    crontab = crontab.trim() + '\n' + cronLine + '\n';

    // Install new crontab
    await this.executor.execute(`echo "${crontab}" | crontab -`);
  }

  private async removeCronJob(task: ScheduledTask): Promise<void> {
    const result = await this.executor.execute('crontab -l 2>/dev/null || echo ""');
    let crontab = result.output || '';

    crontab = crontab.split('\n')
      .filter(line => !line.includes(`openasst:${task.id}`))
      .join('\n');

    await this.executor.execute(`echo "${crontab}" | crontab -`);
  }

  /**
   * Parse common schedule expressions
   */
  parseSchedule(expression: string): string {
    const presets: { [key: string]: string } = {
      'every minute': '* * * * *',
      'every hour': '0 * * * *',
      'every day': '0 0 * * *',
      'every week': '0 0 * * 0',
      'every month': '0 0 1 * *',
      'daily': '0 0 * * *',
      'weekly': '0 0 * * 0',
      'monthly': '0 0 1 * *'
    };

    return presets[expression.toLowerCase()] || expression;
  }
}
