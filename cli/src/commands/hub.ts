import { Logger } from '../utils/logger';
import { WSHub } from '../core/ws-hub';
import { DeviceManager } from '../core/device-manager';

let hubInstance: WSHub | null = null;

export async function hubStartCommand(): Promise<void> {
  if (hubInstance && hubInstance.isRunning()) {
    Logger.warning('Hub is already running');
    return;
  }

  hubInstance = new WSHub();
  hubInstance.start();

  const deviceManager = new DeviceManager();
  Logger.info(`Secret key: ${deviceManager.getSecretKey()}`);
  Logger.info('Press Ctrl+C to stop');

  // Keep process running
  process.on('SIGINT', () => {
    Logger.info('\nStopping hub...');
    if (hubInstance) hubInstance.stop();
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

export async function hubStatusCommand(): Promise<void> {
  const hub = new WSHub();
  const deviceManager = new DeviceManager();

  Logger.info('Hub Configuration:');
  console.log(`  Port: ${deviceManager.getMasterPort()}`);
  console.log(`  Secret: ${deviceManager.getSecretKey().substring(0, 8)}...`);
  console.log('');

  const agents = hub.getOnlineAgents();
  if (agents.length === 0) {
    Logger.info('No agents connected');
  } else {
    Logger.info(`Online agents (${agents.length}):`);
    for (const agent of agents) {
      console.log(`  ● ${agent.name}`);
    }
  }
}

export async function hubStopCommand(): Promise<void> {
  if (hubInstance) {
    hubInstance.stop();
    hubInstance = null;
  } else {
    Logger.info('Hub is not running');
  }
}

export function getHub(): WSHub | null {
  return hubInstance;
}
