import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ServiceInfo {
  name: string;
  pid?: number;
  command: string;
  workDir: string;
  status: 'running' | 'stopped' | 'unknown';
  startedAt?: Date;
  logFile?: string;
}

export class ServiceManager {
  private executor: CommandExecutor;
  private servicesFile: string;
  private services: Map<string, ServiceInfo> = new Map();

  constructor() {
    this.executor = new CommandExecutor();
    this.servicesFile = path.join(os.homedir(), '.openasst-cli', 'services.json');
    this.loadServices();
  }

  /**
   * Start service
   */
  async start(name: string, command: string, workDir?: string): Promise<boolean> {
    const dir = workDir || process.cwd();
    const logFile = path.join(os.homedir(), '.openasst-cli', 'logs', `${name}.log`);

    // Ensure log directory exists
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Use nohup to start in background
    const startCmd = `cd "${dir}" && nohup ${command} > "${logFile}" 2>&1 & echo $!`;
    const log = await this.executor.execute(startCmd);

    if (log.exitCode === 0) {
      const pid = parseInt(log.output.trim());

      this.services.set(name, {
        name,
        pid,
        command,
        workDir: dir,
        status: 'running',
        startedAt: new Date(),
        logFile
      });

      this.saveServices();
      Logger.success(`Service ${name} started (PID: ${pid})`);
      return true;
    }

    Logger.error(`Start failed: ${log.error || log.output}`);
    return false;
  }

  /**
   * Stop service
   */
  async stop(name: string): Promise<boolean> {
    const service = this.services.get(name);
    if (!service) {
      Logger.error(`Service not found: ${name}`);
      return false;
    }

    if (service.pid) {
      const log = await this.executor.execute(`kill ${service.pid} 2>/dev/null`);
      if (log.exitCode === 0) {
        service.status = 'stopped';
        service.pid = undefined;
        this.saveServices();
        Logger.success(`Service ${name} stopped`);
        return true;
      }
    }

    Logger.error(`Stop failed`);
    return false;
  }

  /**
   * Restart service
   */
  async restart(name: string): Promise<boolean> {
    const service = this.services.get(name);
    if (!service) {
      Logger.error(`Service not found: ${name}`);
      return false;
    }

    await this.stop(name);
    await new Promise(r => setTimeout(r, 1000));
    return this.start(name, service.command, service.workDir);
  }

  /**
   * Get service status
   */
  async status(name: string): Promise<ServiceInfo | null> {
    const service = this.services.get(name);
    if (!service) return null;

    // Check if process exists
    if (service.pid) {
      const log = await this.executor.execute(`ps -p ${service.pid} > /dev/null 2>&1`);
      service.status = log.exitCode === 0 ? 'running' : 'stopped';
    }

    return service;
  }

  /**
   * List all services
   */
  async list(): Promise<ServiceInfo[]> {
    const result: ServiceInfo[] = [];

    for (const [name] of this.services) {
      const info = await this.status(name);
      if (info) result.push(info);
    }

    return result;
  }

  /**
   * View logs
   */
  async logs(name: string, lines: number = 50): Promise<string> {
    const service = this.services.get(name);
    if (!service?.logFile) {
      return 'No log file';
    }

    const log = await this.executor.execute(`tail -n ${lines} "${service.logFile}"`);
    return log.output;
  }

  private loadServices(): void {
    try {
      if (fs.existsSync(this.servicesFile)) {
        const data = JSON.parse(fs.readFileSync(this.servicesFile, 'utf-8'));
        for (const s of data) {
          this.services.set(s.name, s);
        }
      }
    } catch (e) {}
  }

  private saveServices(): void {
    const dir = path.dirname(this.servicesFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      this.servicesFile,
      JSON.stringify(Array.from(this.services.values()), null, 2)
    );
  }
}
