import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { ProjectMonitor } from '../core/monitor';
import { MonitorTarget, MonitorConfig } from '../types';

export async function monitorStartCommand(options: any): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  const monitor = new ProjectMonitor(config);
  let monitorConfig = monitor.loadConfig();

  if (!monitorConfig || options.new) {
    monitorConfig = await createMonitorConfig();
  }

  if (monitorConfig.targets.length === 0) {
    Logger.error('No monitor targets configured');
    return;
  }

  await monitor.start(monitorConfig);

  Logger.info('\nPress Ctrl+C to stop monitoring\n');

  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });

  // Show status periodically
  setInterval(() => {
    const statuses = monitor.getStatus();
    console.clear();
    Logger.info('=== Monitor Status ===\n');
    statuses.forEach(s => {
      const icon = s.healthy ? '✓' : '✗';
      const color = s.healthy ? '\x1b[32m' : '\x1b[31m';
      console.log(`${color}${icon}\x1b[0m ${s.target.name}`);
      console.log(`  Type: ${s.target.type}`);
      console.log(`  Target: ${s.target.target}`);
      console.log(`  Last check: ${s.lastCheck.toLocaleTimeString()}`);
      if (s.lastError) console.log(`  Error: ${s.lastError}`);
      console.log('');
    });
  }, 5000);
}

async function createMonitorConfig(): Promise<MonitorConfig> {
  const targets: MonitorTarget[] = [];

  Logger.info('Create Monitor Configuration\n');

  let addMore = true;
  while (addMore) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Monitor name:',
        validate: (input: string) => input.length > 0
      },
      {
        type: 'list',
        name: 'type',
        message: 'Monitor type:',
        choices: [
          { name: 'Process', value: 'process' },
          { name: 'Port', value: 'port' },
          { name: 'URL', value: 'url' },
          { name: 'Command', value: 'command' },
          { name: 'File', value: 'file' }
        ]
      },
      {
        type: 'input',
        name: 'target',
        message: 'Target (process/port/URL/command/path):',
        validate: (input: string) => input.length > 0
      },
      {
        type: 'number',
        name: 'interval',
        message: 'Check interval (seconds):',
        default: 30
      },
      {
        type: 'confirm',
        name: 'autoRestart',
        message: 'Enable auto restart?',
        default: true
      }
    ]);

    let restartCommand: string | undefined;
    if (answers.autoRestart) {
      const restart = await inquirer.prompt([{
        type: 'input',
        name: 'command',
        message: 'Restart command:'
      }]);
      restartCommand = restart.command;
    }

    targets.push({
      name: answers.name,
      type: answers.type,
      target: answers.target,
      interval: answers.interval,
      autoRestart: answers.autoRestart,
      restartCommand
    });

    const more = await inquirer.prompt([{
      type: 'confirm',
      name: 'addMore',
      message: 'Add more targets?',
      default: false
    }]);
    addMore = more.addMore;
  }

  return { targets, globalInterval: 30, maxRestarts: 3 };
}

export async function monitorStatusCommand(): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  const monitor = new ProjectMonitor(config);
  const monitorConfig = monitor.loadConfig();

  if (!monitorConfig) {
    Logger.error('No config found. Run "openasst monitor start" first');
    return;
  }

  Logger.info('Monitor Configuration:\n');
  monitorConfig.targets.forEach((t, i) => {
    console.log(`${i + 1}. ${t.name}`);
    console.log(`   Type: ${t.type}`);
    console.log(`   Target: ${t.target}`);
    console.log(`   Interval: ${t.interval}s`);
    console.log(`   Auto restart: ${t.autoRestart ? 'Yes' : 'No'}`);
    console.log('');
  });
}