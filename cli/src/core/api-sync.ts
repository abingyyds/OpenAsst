import { CommandExecutor } from './executor';
import { DeviceManager } from './device-manager';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { DeviceConfig } from '../types';
import * as os from 'os';

export class ApiSync {
  private executor: CommandExecutor;
  private deviceManager: DeviceManager;

  constructor() {
    this.executor = new CommandExecutor();
    this.deviceManager = new DeviceManager();
  }

  async syncToDevice(deviceIdOrName: string): Promise<boolean> {
    const device = this.deviceManager.getDevice(deviceIdOrName);
    if (!device) {
      Logger.error(`Device not found: ${deviceIdOrName}`);
      return false;
    }

    const config = ConfigManager.load();
    if (!config || !config.apiKey) {
      Logger.error('No API configuration found. Run "openasst config" first.');
      return false;
    }

    Logger.info(`Syncing API config to ${device.name}...`);

    try {
      // Create API config for remote device
      const apiConfig = {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || 'https://api.anthropic.com',
        model: config.model || 'claude-3-5-sonnet-20241022',
        tavilyApiKey: config.tavilyApiKey,
        serperApiKey: config.serperApiKey
      };

      const configJson = JSON.stringify(apiConfig);

      // Create config directory and write config
      await this.sshExec(device, 'mkdir -p ~/.openasst-cli');

      // Write config file (escape special characters)
      const escaped = configJson.replace(/'/g, "'\\''");
      await this.sshExec(device, `echo '${escaped}' > ~/.openasst-cli/config.json`);

      Logger.success(`API config synced to ${device.name}`);
      return true;
    } catch (error) {
      Logger.error(`Sync failed: ${(error as Error).message}`);
      return false;
    }
  }

  async syncToAll(): Promise<{ success: number; failed: number }> {
    const devices = this.deviceManager.listDevices();
    let success = 0;
    let failed = 0;

    for (const device of devices) {
      const ok = await this.syncToDevice(device.id);
      if (ok) success++;
      else failed++;
    }

    return { success, failed };
  }

  async syncToDevices(ids: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const ok = await this.syncToDevice(id);
      if (ok) success++;
      else failed++;
    }

    return { success, failed };
  }

  private async sshExec(device: DeviceConfig, command: string): Promise<any> {
    let sshCmd: string;
    const keyPath = device.privateKeyPath?.replace('~', os.homedir());

    if (device.authType === 'privateKey' && keyPath) {
      sshCmd = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -p ${device.port} ${device.username}@${device.host} "${command}"`;
    } else if (device.password) {
      sshCmd = `sshpass -p "${device.password}" ssh -o StrictHostKeyChecking=no -p ${device.port} ${device.username}@${device.host} "${command}"`;
    } else {
      sshCmd = `ssh -o StrictHostKeyChecking=no -p ${device.port} ${device.username}@${device.host} "${command}"`;
    }

    return this.executor.execute(sshCmd);
  }
}
