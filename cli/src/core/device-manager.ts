import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';
import { DeviceConfig, DeviceGroup, ClusterConfig, DeviceStatus } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const CONFIG_DIR = path.join(os.homedir(), '.openasst-cli');
const DEVICES_FILE = path.join(CONFIG_DIR, 'devices.json');

export class DeviceManager {
  private executor: CommandExecutor;
  private devices: Map<string, DeviceConfig> = new Map();
  private groups: Map<string, DeviceGroup> = new Map();
  private masterPort: number = 9527;
  private secretKey: string = '';

  constructor() {
    this.executor = new CommandExecutor();
    this.loadConfig();
  }

  // ============================================
  // Device CRUD Operations
  // ============================================

  async addDevice(device: Partial<DeviceConfig>): Promise<DeviceConfig> {
    const id = device.id || this.generateId();
    const newDevice: DeviceConfig = {
      id,
      name: device.name || id,
      host: device.host || '',
      port: device.port || 22,
      username: device.username || 'root',
      authType: device.authType || 'password',
      password: device.password,
      privateKeyPath: device.privateKeyPath,
      tags: device.tags || [],
      group: device.group,
      description: device.description,
      createdAt: new Date()
    };

    this.devices.set(id, newDevice);
    this.saveConfig();
    Logger.success(`Device "${newDevice.name}" added (ID: ${id})`);
    return newDevice;
  }

  getDevice(idOrName: string): DeviceConfig | null {
    // Try by ID first
    if (this.devices.has(idOrName)) {
      return this.devices.get(idOrName)!;
    }
    // Try by name
    for (const device of this.devices.values()) {
      if (device.name === idOrName) {
        return device;
      }
    }
    return null;
  }

  listDevices(): DeviceConfig[] {
    return Array.from(this.devices.values());
  }

  updateDevice(idOrName: string, updates: Partial<DeviceConfig>): boolean {
    const device = this.getDevice(idOrName);
    if (!device) {
      Logger.error(`Device not found: ${idOrName}`);
      return false;
    }

    Object.assign(device, updates);
    this.devices.set(device.id, device);
    this.saveConfig();
    Logger.success(`Device "${device.name}" updated`);
    return true;
  }

  removeDevice(idOrName: string): boolean {
    const device = this.getDevice(idOrName);
    if (!device) {
      Logger.error(`Device not found: ${idOrName}`);
      return false;
    }

    this.devices.delete(device.id);
    this.saveConfig();
    Logger.success(`Device "${device.name}" removed`);
    return true;
  }

  // ============================================
  // Device Filtering
  // ============================================

  getDevicesByTags(tags: string[]): DeviceConfig[] {
    return this.listDevices().filter(device =>
      tags.some(tag => device.tags.includes(tag))
    );
  }

  getDevicesByGroup(groupName: string): DeviceConfig[] {
    const group = this.groups.get(groupName);
    if (!group) return [];

    return group.devices
      .map(id => this.devices.get(id))
      .filter((d): d is DeviceConfig => d !== undefined);
  }

  getDevicesByIds(ids: string[]): DeviceConfig[] {
    return ids
      .map(id => this.getDevice(id))
      .filter((d): d is DeviceConfig => d !== null);
  }

  getAllOnlineDevices(): DeviceConfig[] {
    // For now, return all devices
    // In future, this will check WebSocket connection status
    return this.listDevices();
  }

  // ============================================
  // Group Management
  // ============================================

  addGroup(group: DeviceGroup): void {
    this.groups.set(group.name, group);
    this.saveConfig();
    Logger.success(`Group "${group.name}" created`);
  }

  getGroup(name: string): DeviceGroup | null {
    return this.groups.get(name) || null;
  }

  listGroups(): DeviceGroup[] {
    return Array.from(this.groups.values());
  }

  removeGroup(name: string): boolean {
    if (!this.groups.has(name)) {
      Logger.error(`Group not found: ${name}`);
      return false;
    }
    this.groups.delete(name);
    this.saveConfig();
    Logger.success(`Group "${name}" removed`);
    return true;
  }

  // ============================================
  // SSH Connection Test
  // ============================================

  async testConnection(idOrName: string): Promise<boolean> {
    const device = this.getDevice(idOrName);
    if (!device) {
      Logger.error(`Device not found: ${idOrName}`);
      return false;
    }

    Logger.info(`Testing connection to ${device.name} (${device.host})...`);

    try {
      let sshCmd: string;

      if (device.authType === 'privateKey' && device.privateKeyPath) {
        const keyPath = device.privateKeyPath.replace('~', os.homedir());
        sshCmd = `ssh -i "${keyPath}" -o ConnectTimeout=10 -o StrictHostKeyChecking=no -p ${device.port} ${device.username}@${device.host} "echo OK"`;
      } else {
        // For password auth, we need sshpass
        if (device.password) {
          sshCmd = `sshpass -p "${device.password}" ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -p ${device.port} ${device.username}@${device.host} "echo OK"`;
        } else {
          sshCmd = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -p ${device.port} ${device.username}@${device.host} "echo OK"`;
        }
      }

      const result = await this.executor.execute(sshCmd);

      if (result.exitCode === 0 && result.output.trim() === 'OK') {
        Logger.success(`Connection successful!`);
        return true;
      } else {
        Logger.error(`Connection failed: ${result.error || result.output}`);
        return false;
      }
    } catch (error) {
      Logger.error(`Connection error: ${(error as Error).message}`);
      return false;
    }
  }

  // ============================================
  // Master Configuration
  // ============================================

  getMasterPort(): number {
    return this.masterPort;
  }

  setMasterPort(port: number): void {
    this.masterPort = port;
    this.saveConfig();
  }

  getSecretKey(): string {
    if (!this.secretKey) {
      this.secretKey = this.generateSecretKey();
      this.saveConfig();
    }
    return this.secretKey;
  }

  setSecretKey(key: string): void {
    this.secretKey = key;
    this.saveConfig();
  }

  // ============================================
  // Import/Export
  // ============================================

  importFromJson(filePath: string): number {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      let count = 0;

      if (Array.isArray(data)) {
        for (const device of data) {
          this.addDevice(device);
          count++;
        }
      } else if (data.devices) {
        for (const device of data.devices) {
          this.addDevice(device);
          count++;
        }
      }

      Logger.success(`Imported ${count} devices`);
      return count;
    } catch (error) {
      Logger.error(`Import failed: ${(error as Error).message}`);
      return 0;
    }
  }

  exportToJson(filePath: string): boolean {
    try {
      const data = {
        masterPort: this.masterPort,
        devices: this.listDevices(),
        groups: this.listGroups()
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      Logger.success(`Exported to ${filePath}`);
      return true;
    } catch (error) {
      Logger.error(`Export failed: ${(error as Error).message}`);
      return false;
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private generateId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  private generateSecretKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(DEVICES_FILE)) {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf-8'));

        if (data.devices) {
          for (const device of data.devices) {
            this.devices.set(device.id, device);
          }
        }

        if (data.groups) {
          for (const group of data.groups) {
            this.groups.set(group.name, group);
          }
        }

        if (data.masterPort) {
          this.masterPort = data.masterPort;
        }

        if (data.secretKey) {
          this.secretKey = data.secretKey;
        }
      }
    } catch (error) {
      Logger.warning(`Failed to load devices config: ${(error as Error).message}`);
    }
  }

  private saveConfig(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }

      const data = {
        masterPort: this.masterPort,
        secretKey: this.secretKey,
        devices: Array.from(this.devices.values()),
        groups: Array.from(this.groups.values())
      };

      fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      Logger.error(`Failed to save devices config: ${(error as Error).message}`);
    }
  }
}
