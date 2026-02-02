import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
}

export class Executor {
  private maxBuffer = 10 * 1024 * 1024; // 10MB
  private timeout = 300000; // 5 minutes

  async execute(command: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: this.maxBuffer,
        timeout: this.timeout,
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
      });

      return {
        success: true,
        output: stdout || stderr,
        exitCode: 0,
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
        exitCode: error.code || 1,
        duration: Date.now() - startTime
      };
    }
  }

  async getSystemInfo(): Promise<string> {
    const info = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + 'GB',
      uptime: Math.round(os.uptime() / 3600) + 'h'
    };
    return JSON.stringify(info);
  }
}
