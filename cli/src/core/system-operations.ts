import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';

export interface SystemInfo {
  platform: string;
  arch: string;
  hostname: string;
  username: string;
  homeDir: string;
  shell: string;
  packageManager: string;
  osName: string;
  osVersion: string;
  memory: { total: number; free: number };
  cpu: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: string;
  memory: string;
  command: string;
}

export interface DiskInfo {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: string;
  mountPoint: string;
}

export class SystemOperations {
  private executor: CommandExecutor;
  private cachedInfo: SystemInfo | null = null;

  constructor() {
    this.executor = new CommandExecutor();
  }

  /**
   * Get comprehensive system information
   */
  async getSystemInfo(): Promise<SystemInfo> {
    if (this.cachedInfo) return this.cachedInfo;

    const info: SystemInfo = {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      username: os.userInfo().username,
      homeDir: os.homedir(),
      shell: process.env.SHELL || 'unknown',
      packageManager: await this.detectPackageManager(),
      osName: '',
      osVersion: '',
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      },
      cpu: os.cpus()[0]?.model || 'unknown'
    };

    // Get OS details
    if (process.platform === 'darwin') {
      const result = await this.executor.execute('sw_vers');
      if (result.exitCode === 0) {
        const lines = result.output.split('\n');
        info.osName = lines.find(l => l.includes('ProductName'))?.split(':')[1]?.trim() || 'macOS';
        info.osVersion = lines.find(l => l.includes('ProductVersion'))?.split(':')[1]?.trim() || '';
      }
    } else if (process.platform === 'linux') {
      const result = await this.executor.execute('cat /etc/os-release');
      if (result.exitCode === 0) {
        const lines = result.output.split('\n');
        info.osName = lines.find(l => l.startsWith('NAME='))?.split('=')[1]?.replace(/"/g, '') || 'Linux';
        info.osVersion = lines.find(l => l.startsWith('VERSION='))?.split('=')[1]?.replace(/"/g, '') || '';
      }
    }

    this.cachedInfo = info;
    return info;
  }

  /**
   * Detect the system package manager
   */
  async detectPackageManager(): Promise<string> {
    const managers = [
      { name: 'brew', check: 'which brew' },
      { name: 'apt', check: 'which apt-get' },
      { name: 'yum', check: 'which yum' },
      { name: 'dnf', check: 'which dnf' },
      { name: 'pacman', check: 'which pacman' },
      { name: 'apk', check: 'which apk' }
    ];

    for (const pm of managers) {
      const result = await this.executor.execute(pm.check);
      if (result.exitCode === 0) {
        return pm.name;
      }
    }

    return 'unknown';
  }

  /**
   * Install a package
   */
  async installPackage(packageName: string): Promise<{ success: boolean; output: string }> {
    const pm = await this.detectPackageManager();
    let command: string;

    switch (pm) {
      case 'brew':
        command = `brew install ${packageName}`;
        break;
      case 'apt':
        command = `sudo apt-get install -y ${packageName}`;
        break;
      case 'yum':
        command = `sudo yum install -y ${packageName}`;
        break;
      case 'dnf':
        command = `sudo dnf install -y ${packageName}`;
        break;
      case 'pacman':
        command = `sudo pacman -S --noconfirm ${packageName}`;
        break;
      case 'apk':
        command = `sudo apk add ${packageName}`;
        break;
      default:
        return { success: false, output: 'Unknown package manager' };
    }

    Logger.command(command);
    const result = await this.executor.execute(command);
    return {
      success: result.exitCode === 0,
      output: result.output || result.error || ''
    };
  }

  /**
   * Check if a command exists
   */
  async commandExists(command: string): Promise<boolean> {
    const result = await this.executor.execute(`which ${command} 2>/dev/null`);
    return result.exitCode === 0;
  }

  /**
   * Get running processes
   */
  async getProcesses(filter?: string): Promise<ProcessInfo[]> {
    let command: string;
    if (process.platform === 'darwin') {
      command = 'ps aux | head -20';
    } else {
      command = 'ps aux --sort=-%cpu | head -20';
    }

    if (filter) {
      command = `ps aux | grep -i "${filter}" | grep -v grep`;
    }

    const result = await this.executor.execute(command);
    if (result.exitCode !== 0) return [];

    const lines = result.output.split('\n').slice(1);
    return lines.filter(l => l.trim()).map(line => {
      const parts = line.split(/\s+/);
      return {
        pid: parseInt(parts[1]) || 0,
        name: parts[10] || '',
        cpu: parts[2] || '0',
        memory: parts[3] || '0',
        command: parts.slice(10).join(' ')
      };
    });
  }

  /**
   * Kill a process
   */
  async killProcess(pid: number, force: boolean = false): Promise<boolean> {
    const signal = force ? '-9' : '-15';
    const result = await this.executor.execute(`kill ${signal} ${pid}`);
    return result.exitCode === 0;
  }

  /**
   * Get disk usage
   */
  async getDiskUsage(): Promise<DiskInfo[]> {
    const result = await this.executor.execute('df -h');
    if (result.exitCode !== 0) return [];

    const lines = result.output.split('\n').slice(1);
    return lines.filter(l => l.trim()).map(line => {
      const parts = line.split(/\s+/);
      return {
        filesystem: parts[0] || '',
        size: parts[1] || '',
        used: parts[2] || '',
        available: parts[3] || '',
        usePercent: parts[4] || '',
        mountPoint: parts[5] || ''
      };
    });
  }

  /**
   * Get port usage
   */
  async getPortUsage(port?: number): Promise<{ port: number; pid: number; process: string }[]> {
    let command: string;
    if (process.platform === 'darwin') {
      command = port
        ? `lsof -i :${port} -P -n | grep LISTEN`
        : 'lsof -i -P -n | grep LISTEN | head -20';
    } else {
      command = port
        ? `ss -tlnp | grep :${port}`
        : 'ss -tlnp | head -20';
    }

    const result = await this.executor.execute(command);
    if (result.exitCode !== 0) return [];

    const ports: { port: number; pid: number; process: string }[] = [];
    const lines = result.output.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      const portMatch = line.match(/:(\d+)/);
      const pidMatch = line.match(/(\d+)\//);
      if (portMatch) {
        ports.push({
          port: parseInt(portMatch[1]),
          pid: pidMatch ? parseInt(pidMatch[1]) : 0,
          process: line
        });
      }
    }

    return ports;
  }

  /**
   * Create a systemd service
   */
  async createSystemdService(
    name: string,
    command: string,
    workingDir: string,
    options: {
      description?: string;
      user?: string;
      restart?: 'always' | 'on-failure' | 'no';
      env?: Record<string, string>;
    } = {}
  ): Promise<{ success: boolean; output: string }> {
    const {
      description = `${name} service`,
      user = os.userInfo().username,
      restart = 'on-failure',
      env = {}
    } = options;

    const envLines = Object.entries(env)
      .map(([k, v]) => `Environment="${k}=${v}"`)
      .join('\n');

    const serviceContent = `[Unit]
Description=${description}
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${workingDir}
ExecStart=${command}
Restart=${restart}
${envLines}

[Install]
WantedBy=multi-user.target
`;

    const servicePath = `/etc/systemd/system/${name}.service`;

    // Write service file
    const writeResult = await this.executor.execute(
      `echo '${serviceContent}' | sudo tee ${servicePath}`
    );

    if (writeResult.exitCode !== 0) {
      return { success: false, output: writeResult.error || 'Failed to create service file' };
    }

    // Reload systemd and enable service
    await this.executor.execute('sudo systemctl daemon-reload');
    const enableResult = await this.executor.execute(`sudo systemctl enable ${name}`);

    return {
      success: enableResult.exitCode === 0,
      output: `Service ${name} created at ${servicePath}`
    };
  }

  /**
   * Manage systemd service
   */
  async manageService(
    name: string,
    action: 'start' | 'stop' | 'restart' | 'status' | 'enable' | 'disable'
  ): Promise<{ success: boolean; output: string }> {
    const result = await this.executor.execute(`sudo systemctl ${action} ${name}`);
    return {
      success: result.exitCode === 0,
      output: result.output || result.error || ''
    };
  }

  /**
   * Setup firewall rule
   */
  async setupFirewall(
    port: number,
    action: 'allow' | 'deny',
    protocol: 'tcp' | 'udp' = 'tcp'
  ): Promise<{ success: boolean; output: string }> {
    // Try ufw first (Ubuntu/Debian)
    let result = await this.executor.execute(`which ufw`);
    if (result.exitCode === 0) {
      const cmd = action === 'allow'
        ? `sudo ufw allow ${port}/${protocol}`
        : `sudo ufw deny ${port}/${protocol}`;
      result = await this.executor.execute(cmd);
      return { success: result.exitCode === 0, output: result.output || '' };
    }

    // Try firewalld (CentOS/RHEL)
    result = await this.executor.execute(`which firewall-cmd`);
    if (result.exitCode === 0) {
      const cmd = action === 'allow'
        ? `sudo firewall-cmd --permanent --add-port=${port}/${protocol} && sudo firewall-cmd --reload`
        : `sudo firewall-cmd --permanent --remove-port=${port}/${protocol} && sudo firewall-cmd --reload`;
      result = await this.executor.execute(cmd);
      return { success: result.exitCode === 0, output: result.output || '' };
    }

    return { success: false, output: 'No supported firewall found' };
  }

  /**
   * Setup cron job
   */
  async setupCronJob(
    schedule: string,
    command: string,
    name: string
  ): Promise<{ success: boolean; output: string }> {
    // Get current crontab
    const currentResult = await this.executor.execute('crontab -l 2>/dev/null || echo ""');
    const currentCrontab = currentResult.output || '';

    // Check if job already exists
    if (currentCrontab.includes(`# ${name}`)) {
      return { success: false, output: 'Cron job with this name already exists' };
    }

    // Add new job
    const newCrontab = `${currentCrontab}\n# ${name}\n${schedule} ${command}\n`;
    const result = await this.executor.execute(`echo "${newCrontab}" | crontab -`);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? `Cron job "${name}" added` : result.error || ''
    };
  }

  /**
   * Get environment variables
   */
  getEnvVariables(): Record<string, string> {
    return { ...process.env } as Record<string, string>;
  }

  /**
   * Set environment variable (for current session)
   */
  setEnvVariable(key: string, value: string): void {
    process.env[key] = value;
  }

  /**
   * Add to shell profile
   */
  async addToShellProfile(
    content: string,
    shell: 'bash' | 'zsh' | 'auto' = 'auto'
  ): Promise<{ success: boolean; output: string }> {
    let profilePath: string;

    if (shell === 'auto') {
      const currentShell = process.env.SHELL || '';
      shell = currentShell.includes('zsh') ? 'zsh' : 'bash';
    }

    if (shell === 'zsh') {
      profilePath = path.join(os.homedir(), '.zshrc');
    } else {
      profilePath = path.join(os.homedir(), '.bashrc');
    }

    try {
      const existing = fs.existsSync(profilePath)
        ? fs.readFileSync(profilePath, 'utf-8')
        : '';

      if (existing.includes(content)) {
        return { success: true, output: 'Content already exists in profile' };
      }

      fs.appendFileSync(profilePath, `\n${content}\n`);
      return { success: true, output: `Added to ${profilePath}` };
    } catch (e) {
      return { success: false, output: (e as Error).message };
    }
  }
}
