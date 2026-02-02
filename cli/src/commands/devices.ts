import inquirer from 'inquirer';
import { Logger } from '../utils/logger';
import { DeviceManager } from '../core/device-manager';
import { DeviceConfig } from '../types';
import * as os from 'os';

const deviceManager = new DeviceManager();

/**
 * List all devices
 */
export async function devicesListCommand(): Promise<void> {
  const devices = deviceManager.listDevices();

  if (devices.length === 0) {
    Logger.info('No devices registered. Use "openasst devices add" to add a device.');
    return;
  }

  Logger.info(`Total ${devices.length} device(s):\n`);

  for (const device of devices) {
    const icon = '●';
    const color = '\x1b[36m'; // cyan

    console.log(`${color}${icon}\x1b[0m ${device.name}`);
    console.log(`  ID: ${device.id}`);
    console.log(`  Host: ${device.host}:${device.port}`);
    console.log(`  User: ${device.username}`);
    console.log(`  Auth: ${device.authType}`);
    if (device.tags.length > 0) {
      console.log(`  Tags: ${device.tags.join(', ')}`);
    }
    if (device.group) {
      console.log(`  Group: ${device.group}`);
    }
    console.log('');
  }
}

/**
 * Add a new device interactively
 */
export async function devicesAddCommand(): Promise<void> {
  Logger.info('Add a new device\n');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Device name:',
      validate: (input: string) => input.length > 0 || 'Name cannot be empty'
    },
    {
      type: 'input',
      name: 'host',
      message: 'Host (IP or domain):',
      validate: (input: string) => input.length > 0 || 'Host cannot be empty'
    },
    {
      type: 'input',
      name: 'port',
      message: 'SSH port:',
      default: '22',
      validate: (input: string) => !isNaN(parseInt(input)) || 'Port must be a number'
    },
    {
      type: 'input',
      name: 'username',
      message: 'Username:',
      default: 'root'
    },
    {
      type: 'list',
      name: 'authType',
      message: 'Authentication type:',
      choices: [
        { name: 'Password', value: 'password' },
        { name: 'Private Key', value: 'privateKey' }
      ]
    }
  ]);

  // Auth-specific questions
  let authAnswers: any = {};
  if (answers.authType === 'password') {
    authAnswers = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*'
      }
    ]);
  } else {
    authAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'privateKeyPath',
        message: 'Private key path:',
        default: '~/.ssh/id_rsa'
      }
    ]);
  }

  // Optional fields
  const optionalAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tags',
      message: 'Tags (comma-separated, optional):',
      default: ''
    },
    {
      type: 'input',
      name: 'group',
      message: 'Group (optional):',
      default: ''
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
      default: ''
    }
  ]);

  const device: Partial<DeviceConfig> = {
    name: answers.name,
    host: answers.host,
    port: parseInt(answers.port),
    username: answers.username,
    authType: answers.authType,
    ...authAnswers,
    tags: optionalAnswers.tags ? optionalAnswers.tags.split(',').map((t: string) => t.trim()) : [],
    group: optionalAnswers.group || undefined,
    description: optionalAnswers.description || undefined
  };

  await deviceManager.addDevice(device);

  // Ask if user wants to test connection
  const { testNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'testNow',
      message: 'Test connection now?',
      default: true
    }
  ]);

  if (testNow) {
    await deviceManager.testConnection(answers.name);
  }
}

/**
 * Remove a device
 */
export async function devicesRemoveCommand(nameOrId: string): Promise<void> {
  const device = deviceManager.getDevice(nameOrId);
  if (!device) {
    Logger.error(`Device not found: ${nameOrId}`);
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove device "${device.name}" (${device.host})?`,
      default: false
    }
  ]);

  if (confirm) {
    deviceManager.removeDevice(nameOrId);
  }
}

/**
 * Test device connection
 */
export async function devicesTestCommand(nameOrId: string): Promise<void> {
  await deviceManager.testConnection(nameOrId);
}

/**
 * Import devices from file
 */
export async function devicesImportCommand(filePath: string): Promise<void> {
  deviceManager.importFromJson(filePath);
}

/**
 * Export devices to file
 */
export async function devicesExportCommand(filePath: string): Promise<void> {
  deviceManager.exportToJson(filePath);
}

/**
 * List all groups
 */
export async function groupsListCommand(): Promise<void> {
  const groups = deviceManager.listGroups();

  if (groups.length === 0) {
    Logger.info('No groups defined.');
    return;
  }

  Logger.info(`Total ${groups.length} group(s):\n`);

  for (const group of groups) {
    console.log(`\x1b[33m●\x1b[0m ${group.name}`);
    if (group.description) {
      console.log(`  Description: ${group.description}`);
    }
    console.log(`  Devices: ${group.devices.length}`);
    if (group.devices.length > 0) {
      console.log(`  Members: ${group.devices.join(', ')}`);
    }
    console.log('');
  }
}

/**
 * Add a new group
 */
export async function groupsAddCommand(): Promise<void> {
  const devices = deviceManager.listDevices();

  if (devices.length === 0) {
    Logger.error('No devices available. Add devices first.');
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Group name:',
      validate: (input: string) => input.length > 0 || 'Name cannot be empty'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
      default: ''
    },
    {
      type: 'checkbox',
      name: 'devices',
      message: 'Select devices:',
      choices: devices.map(d => ({
        name: `${d.name} (${d.host})`,
        value: d.id
      }))
    }
  ]);

  deviceManager.addGroup({
    name: answers.name,
    description: answers.description || undefined,
    devices: answers.devices
  });
}

/**
 * Remove a group
 */
export async function groupsRemoveCommand(name: string): Promise<void> {
  const group = deviceManager.getGroup(name);
  if (!group) {
    Logger.error(`Group not found: ${name}`);
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove group "${name}"?`,
      default: false
    }
  ]);

  if (confirm) {
    deviceManager.removeGroup(name);
  }
}
