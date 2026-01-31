import inquirer from 'inquirer';
import { Logger } from '../utils/logger';
import { Scheduler } from '../core/scheduler';

const scheduler = new Scheduler();

export async function scheduleListCommand(): Promise<void> {
  const tasks = scheduler.getTasks();

  if (tasks.length === 0) {
    Logger.warning('No scheduled tasks');
    return;
  }

  Logger.info(`Scheduled tasks (${tasks.length}):\n`);
  tasks.forEach(task => {
    const status = task.enabled ? '\x1b[32m●\x1b[0m' : '\x1b[31m○\x1b[0m';
    console.log(`  ${status} ${task.id}`);
    console.log(`    Name: ${task.name}`);
    console.log(`    Schedule: ${task.schedule}`);
    console.log(`    Command: ${task.command}`);
    if (task.lastRun) {
      console.log(`    Last run: ${task.lastRun}`);
    }
    console.log('');
  });
}

export async function scheduleAddCommand(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Task name:',
      validate: (input: string) => input.length > 0 || 'Name required'
    },
    {
      type: 'input',
      name: 'command',
      message: 'Command to execute:',
      validate: (input: string) => input.length > 0 || 'Command required'
    },
    {
      type: 'list',
      name: 'schedule',
      message: 'Schedule:',
      choices: [
        { name: 'Every minute', value: '* * * * *' },
        { name: 'Every hour', value: '0 * * * *' },
        { name: 'Every day at midnight', value: '0 0 * * *' },
        { name: 'Every week (Sunday)', value: '0 0 * * 0' },
        { name: 'Custom cron expression', value: 'custom' }
      ]
    }
  ]);

  let schedule = answers.schedule;
  if (schedule === 'custom') {
    const { customSchedule } = await inquirer.prompt([{
      type: 'input',
      name: 'customSchedule',
      message: 'Cron expression (e.g., "0 9 * * 1-5"):',
      validate: (input: string) => input.length > 0 || 'Expression required'
    }]);
    schedule = customSchedule;
  }

  await scheduler.createTask({
    name: answers.name,
    command: answers.command,
    schedule,
    enabled: true
  });
}

export async function scheduleRemoveCommand(taskId: string): Promise<void> {
  await scheduler.deleteTask(taskId);
}

export async function scheduleToggleCommand(
  taskId: string,
  options: { enable?: boolean; disable?: boolean }
): Promise<void> {
  const enabled = options.enable ? true : options.disable ? false : true;
  await scheduler.toggleTask(taskId, enabled);
}
