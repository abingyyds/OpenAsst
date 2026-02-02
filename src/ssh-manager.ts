import { Client, ConnectConfig } from 'ssh2';
import { ServerConfig, ExecutionLog } from './types';
import * as fs from 'fs';

export class SSHManager {
  private connections: Map<string, Client> = new Map();

  async connect(config: ServerConfig, timeout: number = 60000): Promise<void> {
    // 如果已有连接，先检查是否有效
    const existingClient = this.connections.get(config.id);
    if (existingClient) {
      // 连接已存在，直接返回
      return;
    }

    const client = new Client();

    const sshConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: timeout,
    };

    // Handle both authType and auth_type field names
    const authType = config.authType || (config as any).auth_type;
    // Handle both password and encrypted_password field names
    const password = config.password || (config as any).encrypted_password;
    const privateKey = config.privateKey || (config as any).encrypted_private_key;

    if (authType === 'password' && password) {
      sshConfig.password = password;
    } else if (authType === 'privateKey' && config.privateKeyPath) {
      sshConfig.privateKey = fs.readFileSync(config.privateKeyPath);
    } else if (authType === 'privateKey' && privateKey) {
      sshConfig.privateKey = privateKey;
    }

    return new Promise((resolve, reject) => {
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      // 设置连接超时
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          client.end();
          reject(new Error(`SSH connection timed out after ${timeout / 1000} seconds`));
        }
      }, timeout);

      client.on('ready', () => {
        cleanup();
        if (!resolved) {
          resolved = true;
          this.connections.set(config.id, client);
          resolve();
        }
      });

      client.on('error', (err) => {
        cleanup();
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      client.on('close', () => {
        // 连接关闭时从 map 中移除
        this.connections.delete(config.id);
      });

      client.connect(sshConfig);
    });
  }

  async executeCommand(serverId: string, command: string, timeout: number = 300000): Promise<ExecutionLog> {
    const client = this.connections.get(serverId);
    if (!client) {
      throw new Error(`No connection found for server ${serverId}`);
    }

    return new Promise((resolve, reject) => {
      const startTime = new Date();
      let timeoutId: NodeJS.Timeout | null = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      // 设置超时
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({
            timestamp: startTime,
            command,
            output: '',
            exitCode: 124,
            error: `Command timed out after ${timeout / 1000} seconds`,
          });
        }
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) {
          cleanup();
          if (!resolved) {
            resolved = true;
            reject(err);
          }
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('close', (code: number) => {
          cleanup();
          if (!resolved) {
            resolved = true;
            resolve({
              timestamp: startTime,
              command,
              output,
              exitCode: code,
              error: errorOutput || undefined,
            });
          }
        });

        stream.on('error', (streamErr: Error) => {
          cleanup();
          if (!resolved) {
            resolved = true;
            resolve({
              timestamp: startTime,
              command,
              output,
              exitCode: 1,
              error: streamErr.message,
            });
          }
        });

        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });
      });
    });
  }

  // 流式执行命令，实时返回输出
  executeCommandStream(
    serverId: string,
    command: string,
    onData: (data: string) => void,
    onError: (error: string) => void,
    onClose: (exitCode: number) => void,
    timeout: number = 300000
  ): void {
    const client = this.connections.get(serverId);
    if (!client) {
      onError(`No connection found for server ${serverId}`);
      onClose(1);
      return;
    }

    let timeoutId: NodeJS.Timeout | null = null;
    let closed = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    timeoutId = setTimeout(() => {
      if (!closed) {
        closed = true;
        onError(`Command timed out after ${timeout / 1000} seconds`);
        onClose(124);
      }
    }, timeout);

    client.exec(command, (err, stream) => {
      if (err) {
        cleanup();
        if (!closed) {
          closed = true;
          onError(err.message);
          onClose(1);
        }
        return;
      }

      stream.on('close', (code: number) => {
        cleanup();
        if (!closed) {
          closed = true;
          onClose(code);
        }
      });

      stream.on('data', (data: Buffer) => {
        if (!closed) {
          onData(data.toString());
        }
      });

      stream.stderr.on('data', (data: Buffer) => {
        if (!closed) {
          onData(data.toString()); // 也输出 stderr
        }
      });
    });
  }

  disconnect(serverId: string): void {
    const client = this.connections.get(serverId);
    if (client) {
      client.end();
      this.connections.delete(serverId);
    }
  }

  isConnected(serverId: string): boolean {
    return this.connections.has(serverId);
  }
}
