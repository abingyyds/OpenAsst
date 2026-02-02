import { Logger } from '../utils/logger';
import { WSHub } from '../core/ws-hub';
import { DeviceManager } from '../core/device-manager';
import chalk from 'chalk';

interface RunOptions {
  all?: boolean;
  tags?: string;
  devices?: string;
  group?: string;
  timeout?: string;
  parallel?: boolean;
  serial?: boolean;
}

let hubInstance: WSHub | null = null;

function getOrCreateHub(): WSHub {
  if (!hubInstance) {
    hubInstance = new WSHub();
  }
  return hubInstance;
}

export async function runCommand(
  command: string,
  options: RunOptions
): Promise<void> {
  const deviceManager = new DeviceManager();
  const hub = getOrCreateHub();

  // Determine target devices
  let targetNames: string[] = [];

  if (options.all) {
    targetNames = deviceManager.listDevices().map(d => d.name);
  } else if (options.tags) {
    const tags = options.tags.split(',').map(t => t.trim());
    targetNames = deviceManager.getDevicesByTags(tags).map(d => d.name);
  } else if (options.devices) {
    const ids = options.devices.split(',').map(d => d.trim());
    targetNames = deviceManager.getDevicesByIds(ids).map(d => d.name);
  } else if (options.group) {
    targetNames = deviceManager.getDevicesByGroup(options.group).map(d => d.name);
  }

  if (targetNames.length === 0) {
    Logger.error('No target devices specified');
    Logger.info('Use --all, --tags, --devices, or --group to specify targets');
    return;
  }

  // Start hub if not running
  if (!hub.isRunning()) {
    Logger.info('Starting hub...');
    hub.start();
    await new Promise(r => setTimeout(r, 1000));
  }

  // Check online agents
  const onlineAgents = hub.getOnlineAgents();
  const onlineNames = onlineAgents.map(a => a.name);
  const offlineTargets = targetNames.filter(n => !onlineNames.includes(n));

  if (offlineTargets.length > 0) {
    Logger.warning(`Offline devices: ${offlineTargets.join(', ')}`);
  }

  const activeTargets = targetNames.filter(n => onlineNames.includes(n));
  if (activeTargets.length === 0) {
    Logger.error('No online devices available');
    return;
  }

  Logger.info(`Executing on ${activeTargets.length} device(s)...`);
  console.log(chalk.gray(`Command: ${command}\n`));

  const timeout = parseInt(options.timeout || '60000');
  const results = await hub.broadcast(command, activeTargets, timeout);

  // Display results
  console.log(chalk.cyan('\n─── Results ───\n'));

  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    const icon = result.success ? chalk.green('✓') : chalk.red('✗');
    console.log(`${icon} ${chalk.bold(result.deviceName)}`);

    if (result.output) {
      const lines = result.output.split('\n').slice(0, 10);
      for (const line of lines) {
        console.log(chalk.gray(`  ${line}`));
      }
    }

    if (result.error) {
      console.log(chalk.red(`  Error: ${result.error}`));
    }

    console.log(chalk.gray(`  Duration: ${result.duration}ms\n`));

    if (result.success) successCount++;
    else failCount++;
  }

  // Summary
  console.log(chalk.cyan('─── Summary ───'));
  console.log(`Total: ${results.length}, Success: ${chalk.green(successCount)}, Failed: ${chalk.red(failCount)}`);
}
