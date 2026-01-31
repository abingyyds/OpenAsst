import { Config, MonitorTarget, MonitorStatus, MonitorConfig, ExecutionLog } from '../types';
import { CommandExecutor } from './executor';
import { ErrorHandler } from './error-handler';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ProjectMonitor {
  private executor: CommandExecutor;
  private errorHandler: ErrorHandler;
  private statusMap: Map<string, MonitorStatus> = new Map();
  private intervalIds: Map<string, NodeJS.Timeout> = new Map();
  private running: boolean = false;
  private configPath: string;

  constructor(private config: Config) {
    this.executor = new CommandExecutor();
    this.errorHandler = new ErrorHandler(config);
    this.configPath = path.join(os.homedir(), '.openasst-cli', 'monitor.json');
  }

  /**
   * Start monitoring
   */
  async start(monitorConfig: MonitorConfig): Promise<void> {
    if (this.running) {
      Logger.warning('Monitor is already running');
      return;
    }

    this.running = true;
    Logger.info('Starting project monitoring...\n');

    for (const target of monitorConfig.targets) {
      this.startMonitorTarget(target, monitorConfig);
    }

    // Save config
    this.saveConfig(monitorConfig);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.running = false;
    for (const [name, intervalId] of this.intervalIds) {
      clearInterval(intervalId);
      Logger.info(`Stopped monitoring: ${name}`);
    }
    this.intervalIds.clear();
    Logger.info('Monitoring stopped');
  }

  /**
   * Get all monitor status
   */
  getStatus(): MonitorStatus[] {
    return Array.from(this.statusMap.values());
  }

  private startMonitorTarget(target: MonitorTarget, config: MonitorConfig): void {
    const interval = (target.interval || config.globalInterval || 30) * 1000;

    // Initialize status
    this.statusMap.set(target.name, {
      target,
      healthy: true,
      lastCheck: new Date(),
      restartCount: 0,
      uptime: 0
    });

    // Check immediately
    this.checkTarget(target, config);

    // Set interval check
    const intervalId = setInterval(() => {
      this.checkTarget(target, config);
    }, interval);

    this.intervalIds.set(target.name, intervalId);
    Logger.info(`Started monitoring: ${target.name} (interval: ${interval / 1000}s)`);
  }

  private async checkTarget(target: MonitorTarget, config: MonitorConfig): Promise<void> {
    const status = this.statusMap.get(target.name);
    if (!status) return;

    let healthy = false;
    let error: string | undefined;

    try {
      switch (target.type) {
        case 'process':
          healthy = await this.checkProcess(target.target);
          break;
        case 'port':
          healthy = await this.checkPort(target.target);
          break;
        case 'url':
          healthy = await this.checkUrl(target.target);
          break;
        case 'command':
          healthy = await this.checkCommand(target.target);
          break;
        case 'file':
          healthy = this.checkFile(target.target);
          break;
      }
    } catch (e) {
      error = (e as Error).message;
    }

    // Update status
    const wasHealthy = status.healthy;
    status.healthy = healthy;
    status.lastCheck = new Date();
    status.lastError = error;

    if (healthy) {
      status.uptime += (target.interval || 30);
    }

    // Handle status change
    if (wasHealthy && !healthy) {
      Logger.error(`[${target.name}] Status abnormal: ${error || 'Check failed'}`);
      await this.handleFailure(target, status, config);
    } else if (!wasHealthy && healthy) {
      Logger.success(`[${target.name}] Recovered`);
    }
  }

  private async checkProcess(processName: string): Promise<boolean> {
    const log = await this.executor.execute(`pgrep -f "${processName}"`);
    return log.exitCode === 0;
  }

  private async checkPort(port: string): Promise<boolean> {
    const log = await this.executor.execute(
      `nc -z localhost ${port} 2>/dev/null || ss -tuln | grep -q ":${port} "`
    );
    return log.exitCode === 0;
  }

  private async checkUrl(url: string): Promise<boolean> {
    const log = await this.executor.execute(
      `curl -sf -o /dev/null -w "%{http_code}" "${url}" | grep -q "^[23]"`
    );
    return log.exitCode === 0;
  }

  private async checkCommand(command: string): Promise<boolean> {
    const log = await this.executor.execute(command);
    return log.exitCode === 0;
  }

  private checkFile(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  private async handleFailure(
    target: MonitorTarget,
    status: MonitorStatus,
    config: MonitorConfig
  ): Promise<void> {
    const maxRestarts = config.maxRestarts || 3;

    if (!target.autoRestart) {
      Logger.warning(`[${target.name}] Auto restart not enabled`);
      return;
    }

    if (status.restartCount >= maxRestarts) {
      Logger.error(`[${target.name}] Max restart count reached (${maxRestarts})`);
      return;
    }

    if (target.restartCommand) {
      Logger.info(`[${target.name}] Attempting auto restart...`);
      status.restartCount++;

      const log = await this.executor.execute(target.restartCommand);
      if (log.exitCode === 0) {
        Logger.success(`[${target.name}] Restart command executed successfully`);
      } else {
        Logger.error(`[${target.name}] Restart failed: ${log.error || log.output}`);
        await this.tryAutoFix(target, log);
      }
    }
  }

  private async tryAutoFix(target: MonitorTarget, log: ExecutionLog): Promise<void> {
    Logger.info(`[${target.name}] Attempting AI auto fix...`);

    const solution = await this.errorHandler.analyzeError({
      command: log.command,
      output: log.output + (log.error || ''),
      exitCode: log.exitCode,
      systemInfo: '',
      previousCommands: [],
      projectContext: `Monitor target: ${target.name}, Type: ${target.type}`
    });

    if (solution.confidence >= 70 && solution.fixCommands.length > 0) {
      Logger.info(`AI suggestion: ${solution.analysis}`);
      for (const cmd of solution.fixCommands) {
        Logger.command(cmd);
        await this.executor.execute(cmd);
      }
    }
  }

  private saveConfig(config: MonitorConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  loadConfig(): MonitorConfig | null {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }
    } catch (e) {}
    return null;
  }
}
