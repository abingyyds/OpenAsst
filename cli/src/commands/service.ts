import inquirer from 'inquirer';
import { Logger } from '../utils/logger';
import { ServiceManager } from '../core/service-manager';

export async function serviceStartCommand(
  name: string,
  command: string,
  options: any
): Promise<void> {
  const manager = new ServiceManager();
  await manager.start(name, command, options.dir);
}

export async function serviceStopCommand(name: string): Promise<void> {
  const manager = new ServiceManager();
  await manager.stop(name);
}

export async function serviceRestartCommand(name: string): Promise<void> {
  const manager = new ServiceManager();
  await manager.restart(name);
}

export async function serviceListCommand(): Promise<void> {
  const manager = new ServiceManager();
  const services = await manager.list();

  if (services.length === 0) {
    Logger.info('No registered services');
    return;
  }

  Logger.info('Service list:\n');

  for (const s of services) {
    const icon = s.status === 'running' ? '●' : '○';
    const color = s.status === 'running' ? '\x1b[32m' : '\x1b[31m';

    console.log(`${color}${icon}\x1b[0m ${s.name}`);
    console.log(`  Command: ${s.command}`);
    console.log(`  Directory: ${s.workDir}`);
    console.log(`  Status: ${s.status}`);
    if (s.pid) console.log(`  PID: ${s.pid}`);
    console.log('');
  }
}

export async function serviceLogsCommand(
  name: string,
  options: any
): Promise<void> {
  const manager = new ServiceManager();
  const lines = parseInt(options.lines) || 50;
  const logs = await manager.logs(name, lines);

  console.log(logs);
}
