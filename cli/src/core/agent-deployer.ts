import { CommandExecutor } from './executor';
import { DeviceManager } from './device-manager';
import { Logger } from '../utils/logger';
import { DeviceConfig } from '../types';
import * as os from 'os';

export class AgentDeployer {
  private executor: CommandExecutor;
  private deviceManager: DeviceManager;

  constructor() {
    this.executor = new CommandExecutor();
    this.deviceManager = new DeviceManager();
  }

  async deploy(deviceIdOrName: string): Promise<boolean> {
    const device = this.deviceManager.getDevice(deviceIdOrName);
    if (!device) {
      Logger.error(`Device not found: ${deviceIdOrName}`);
      return false;
    }

    Logger.info(`Deploying agent to ${device.name} (${device.host})...`);

    try {
      // 1. Test SSH connection
      Logger.info('Testing SSH connection...');
      const testOk = await this.deviceManager.testConnection(device.id);
      if (!testOk) return false;

      // 2. Check Node.js
      Logger.info('Checking Node.js...');
      const hasNode = await this.checkNodeJs(device);
      if (!hasNode) {
        Logger.info('Installing Node.js...');
        await this.installNodeJs(device);
      }

      // 3. Create agent directory
      Logger.info('Creating agent directory...');
      await this.sshExec(device, 'mkdir -p /opt/openasst-agent');

      // 4. Download agent package
      Logger.info('Downloading agent...');
      // For now, we'll create a simple agent script
      await this.createAgentScript(device);

      // 5. Configure agent
      Logger.info('Configuring agent...');
      await this.configureAgent(device);

      // 6. Create systemd service
      Logger.info('Creating systemd service...');
      await this.createSystemdService(device);

      // 7. Start agent
      Logger.info('Starting agent...');
      await this.sshExec(device, 'systemctl daemon-reload');
      await this.sshExec(device, 'systemctl enable openasst-agent');
      await this.sshExec(device, 'systemctl start openasst-agent');

      Logger.success(`Agent deployed to ${device.name}`);
      return true;
    } catch (error) {
      Logger.error(`Deploy failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async checkNodeJs(device: DeviceConfig): Promise<boolean> {
    const result = await this.sshExec(device, 'node --version');
    return result.exitCode === 0;
  }

  private async installNodeJs(device: DeviceConfig): Promise<void> {
    // Install Node.js using package manager
    const cmds = [
      'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
      'apt-get install -y nodejs || yum install -y nodejs'
    ];
    for (const cmd of cmds) {
      await this.sshExec(device, cmd);
    }
  }

  private async createAgentScript(device: DeviceConfig): Promise<void> {
    const script = `#!/usr/bin/env node
const WebSocket = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const config = JSON.parse(fs.readFileSync('/etc/openasst/agent.json'));
let ws;

function connect() {
  ws = new WebSocket(\`ws://\${config.masterHost}:\${config.masterPort}\`);

  ws.on('open', () => {
    console.log('Connected to master');
    ws.send(JSON.stringify({
      type: 'auth',
      payload: { agentName: config.agentName, secretKey: config.secretKey },
      timestamp: Date.now()
    }));
    setInterval(() => {
      ws.send(JSON.stringify({ type: 'heartbeat', payload: {}, timestamp: Date.now() }));
    }, 30000);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'command') {
      exec(msg.payload.command, { maxBuffer: 10*1024*1024 }, (err, stdout, stderr) => {
        ws.send(JSON.stringify({
          type: 'command_result',
          taskId: msg.taskId,
          payload: {
            deviceName: config.agentName,
            success: !err,
            output: stdout || stderr,
            error: err ? err.message : undefined,
            exitCode: err ? err.code || 1 : 0,
            duration: 0
          },
          timestamp: Date.now()
        }));
      });
    }
  });

  ws.on('close', () => setTimeout(connect, 5000));
  ws.on('error', () => {});
}

connect();
`;

    const escaped = script.replace(/'/g, "'\\''");
    await this.sshExec(device, `echo '${escaped}' > /opt/openasst-agent/agent.js`);
    await this.sshExec(device, 'npm install ws -g || true');
  }

  private async configureAgent(device: DeviceConfig): Promise<void> {
    const masterHost = this.getLocalIP();
    const config = {
      masterHost,
      masterPort: this.deviceManager.getMasterPort(),
      secretKey: this.deviceManager.getSecretKey(),
      agentName: device.name
    };

    const json = JSON.stringify(config);
    await this.sshExec(device, 'mkdir -p /etc/openasst');
    await this.sshExec(device, `echo '${json}' > /etc/openasst/agent.json`);
  }

  private async createSystemdService(device: DeviceConfig): Promise<void> {
    const service = `[Unit]
Description=OpenAsst Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/openasst-agent/agent.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`;

    const escaped = service.replace(/'/g, "'\\''");
    await this.sshExec(device, `echo '${escaped}' > /etc/systemd/system/openasst-agent.service`);
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

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }
}
