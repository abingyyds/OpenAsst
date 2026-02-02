import { Logger } from '../utils/logger';
import { AgentDeployer } from '../core/agent-deployer';
import { DeviceManager } from '../core/device-manager';
import { WSHub } from '../core/ws-hub';

interface AgentOptions {
  all?: boolean;
  devices?: string;
}

export async function agentDeployCommand(options: AgentOptions): Promise<void> {
  const deviceManager = new DeviceManager();
  const deployer = new AgentDeployer();

  let targets: string[] = [];

  if (options.all) {
    targets = deviceManager.listDevices().map(d => d.id);
  } else if (options.devices) {
    targets = options.devices.split(',').map(d => d.trim());
  }

  if (targets.length === 0) {
    Logger.error('No targets specified. Use --all or --devices');
    return;
  }

  Logger.info(`Deploying agent to ${targets.length} device(s)...\n`);

  let success = 0;
  let failed = 0;

  for (const target of targets) {
    const ok = await deployer.deploy(target);
    if (ok) success++;
    else failed++;
    console.log('');
  }

  Logger.info(`Deploy complete: ${success} success, ${failed} failed`);
}

export async function agentStatusCommand(): Promise<void> {
  const hub = new WSHub();
  const deviceManager = new DeviceManager();
  const devices = deviceManager.listDevices();

  if (devices.length === 0) {
    Logger.info('No devices configured');
    return;
  }

  const onlineAgents = hub.getOnlineAgents();
  const onlineNames = onlineAgents.map(a => a.name);

  Logger.info(`Agent Status (${onlineAgents.length}/${devices.length} online):\n`);

  for (const device of devices) {
    const online = onlineNames.includes(device.name);
    const icon = online ? '\x1b[32m●\x1b[0m' : '\x1b[31m○\x1b[0m';
    const status = online ? 'online' : 'offline';
    console.log(`${icon} ${device.name} (${device.host}) - ${status}`);
  }
}
