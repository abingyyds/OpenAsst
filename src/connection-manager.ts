import { ServerConfig, ExecutionLog } from './types';
import { SSHManager } from './ssh-manager';
import { exec } from 'child_process';
import { promisify } from 'util';
import Docker from 'dockerode';

const execAsync = promisify(exec);

export interface ConnectionExecutor {
  execute(command: string): Promise<ExecutionLog>;
  disconnect(): void;
}

export class ConnectionManager {
  private sshManager: SSHManager;
  private executors: Map<string, ConnectionExecutor> = new Map();

  constructor() {
    this.sshManager = new SSHManager();
  }

  async getExecutor(config: ServerConfig): Promise<ConnectionExecutor> {
    const key = config.id;

    // 如果已有执行器，检查连接是否有效
    if (this.executors.has(key)) {
      const existingExecutor = this.executors.get(key)!;
      // Try to verify connection is still alive
      try {
        await existingExecutor.execute('echo 1');
        return existingExecutor;
      } catch (error) {
        // Connection is dead, remove and recreate
        console.log(`Connection for ${key} is dead, reconnecting...`);
        existingExecutor.disconnect();
        this.executors.delete(key);
      }
    }

    // 根据连接类型创建执行器
    let executor: ConnectionExecutor;

    switch (config.connectionType) {
      case 'ssh':
        executor = new SSHExecutor(this.sshManager, config);
        break;
      case 'local':
        executor = new LocalExecutor();
        break;
      case 'docker':
        executor = new DockerExecutor(this.sshManager, config);
        break;
      case 'docker-remote':
        executor = new DockerRemoteExecutor(config);
        break;
      case 'kubernetes':
        executor = new KubernetesExecutor(config);
        break;
      case 'wsl':
        executor = new WSLExecutor(config);
        break;
      default:
        throw new Error(`Unsupported connection type: ${config.connectionType}`);
    }

    this.executors.set(key, executor);
    return executor;
  }

  disconnect(serverId: string): void {
    const executor = this.executors.get(serverId);
    if (executor) {
      executor.disconnect();
      this.executors.delete(serverId);
    }
  }

  disconnectAll(): void {
    this.executors.forEach(executor => executor.disconnect());
    this.executors.clear();
  }

  isConnected(serverId: string): boolean {
    return this.executors.has(serverId);
  }
}

// SSH 执行器
class SSHExecutor implements ConnectionExecutor {
  private sshManager: SSHManager;
  private config: ServerConfig;

  constructor(sshManager: SSHManager, config: ServerConfig) {
    this.sshManager = sshManager;
    this.config = config;
  }

  async execute(command: string): Promise<ExecutionLog> {
    await this.sshManager.connect(this.config);
    return this.sshManager.executeCommand(this.config.id, command);
  }

  disconnect(): void {
    this.sshManager.disconnect(this.config.id);
  }
}

// 本地终端执行器
class LocalExecutor implements ConnectionExecutor {
  async execute(command: string): Promise<ExecutionLog> {
    const startTime = new Date();
    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 300000 // 5 minutes
      });

      return {
        timestamp: startTime,
        command,
        output: stdout || stderr,
        exitCode: 0,
        error: stderr || undefined
      };
    } catch (error: any) {
      return {
        timestamp: startTime,
        command,
        output: error.stdout || '',
        exitCode: error.code || 1,
        error: error.stderr || error.message
      };
    }
  }

  disconnect(): void {
    // 本地执行器不需要断开连接
  }
}

// Docker 容器执行器
class DockerExecutor implements ConnectionExecutor {
  private sshManager: SSHManager;
  private config: ServerConfig;

  constructor(sshManager: SSHManager, config: ServerConfig) {
    this.sshManager = sshManager;
    this.config = config;
  }

  async execute(command: string): Promise<ExecutionLog> {
    const startTime = new Date();
    const container = this.config.containerId || this.config.containerName;

    if (!container) {
      return {
        timestamp: startTime,
        command,
        output: '',
        exitCode: 1,
        error: 'Container name or ID not specified'
      };
    }

    // 如果是远程Docker，通过SSH连接执行
    if (this.config.isRemoteDocker) {
      return this.executeRemoteDocker(command, container, startTime);
    }

    // 本地Docker执行
    return this.executeLocalDocker(command, container, startTime);
  }

  private async executeLocalDocker(command: string, container: string, startTime: Date): Promise<ExecutionLog> {
    // Escape command for shell execution
    const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

    // Try with bash first, fallback to sh if bash is not available
    let dockerCommand = `docker exec ${container} bash -c "${escapedCommand}"`;

    try {
      const { stdout, stderr } = await execAsync(dockerCommand, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000
      });

      return {
        timestamp: startTime,
        command,
        output: stdout || stderr,
        exitCode: 0,
        error: stderr || undefined
      };
    } catch (error: any) {
      // If bash failed, try with sh
      if (error.message?.includes('executable file not found') || error.message?.includes('bash')) {
        try {
          dockerCommand = `docker exec ${container} sh -c "${escapedCommand}"`;
          const { stdout, stderr } = await execAsync(dockerCommand, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 300000
          });

          return {
            timestamp: startTime,
            command,
            output: stdout || stderr,
            exitCode: 0,
            error: stderr || undefined
          };
        } catch (shError: any) {
          return {
            timestamp: startTime,
            command,
            output: shError.stdout || '',
            exitCode: shError.code || 1,
            error: this.formatDockerError(shError)
          };
        }
      }

      return {
        timestamp: startTime,
        command,
        output: error.stdout || '',
        exitCode: error.code || 1,
        error: this.formatDockerError(error)
      };
    }
  }

  private async executeRemoteDocker(command: string, container: string, startTime: Date): Promise<ExecutionLog> {
    // 验证远程连接配置
    if (!this.config.remoteHost || !this.config.remoteUsername) {
      return {
        timestamp: startTime,
        command,
        output: '',
        exitCode: 1,
        error: 'Remote Docker requires SSH host and username'
      };
    }

    // 创建SSH配置
    const sshConfig: ServerConfig = {
      id: `${this.config.id}-ssh`,
      name: `${this.config.name}-ssh`,
      connectionType: 'ssh',
      host: this.config.remoteHost,
      port: this.config.remotePort || 22,
      username: this.config.remoteUsername,
      authType: this.config.remoteAuthType || 'password',
      password: this.config.remotePassword,
      privateKeyPath: this.config.remotePrivateKeyPath
    };

    try {
      // 连接到远程服务器
      await this.sshManager.connect(sshConfig);

      // 在远程服务器上执行docker命令
      const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
      const dockerCommand = `docker exec ${container} bash -c "${escapedCommand}"`;

      const result = await this.sshManager.executeCommand(sshConfig.id, dockerCommand);

      // 如果bash失败，尝试sh
      if (result.exitCode !== 0 && (result.error?.includes('bash') || result.error?.includes('executable file not found'))) {
        const shDockerCommand = `docker exec ${container} sh -c "${escapedCommand}"`;
        return await this.sshManager.executeCommand(sshConfig.id, shDockerCommand);
      }

      return result;
    } catch (error: any) {
      return {
        timestamp: startTime,
        command,
        output: '',
        exitCode: 1,
        error: `Remote Docker connection failed: ${error.message}`
      };
    }
  }

  private formatDockerError(error: any): string {
    const message = error.stderr || error.message || '';

    if (message.includes('No such container')) {
      return `Container '${this.config.containerId || this.config.containerName}' not found. Please check if the container exists.`;
    }
    if (message.includes('is not running')) {
      return `Container '${this.config.containerId || this.config.containerName}' is not running. Please start the container first.`;
    }
    if (message.includes('Cannot connect to the Docker daemon')) {
      return 'Cannot connect to Docker daemon. Please check if Docker is running.';
    }
    if (message.includes('command not found') || message.includes('docker: not found')) {
      return 'Docker command not found. Please install Docker first.';
    }

    return message;
  }

  disconnect(): void {
    // Docker 执行器不需要断开连接
  }
}

// Docker Remote API 执行器
class DockerRemoteExecutor implements ConnectionExecutor {
  private docker: Docker;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;

    // 验证配置
    if (!config.dockerApiHost) {
      throw new Error('Docker API host is required');
    }

    // 构建Docker连接配置
    const dockerOptions: any = {
      host: config.dockerApiHost,
      port: config.dockerApiPort || 2376,
      protocol: config.dockerApiProtocol || 'https'
    };

    // 如果提供了TLS证书，添加到配置中
    if (config.dockerTlsCa || config.dockerTlsCert || config.dockerTlsKey) {
      dockerOptions.ca = config.dockerTlsCa;
      dockerOptions.cert = config.dockerTlsCert;
      dockerOptions.key = config.dockerTlsKey;
    }

    this.docker = new Docker(dockerOptions);
  }

  async execute(command: string): Promise<ExecutionLog> {
    const startTime = new Date();
    const container = this.config.containerId || this.config.containerName;

    if (!container) {
      return {
        timestamp: startTime,
        command,
        output: '',
        exitCode: 1,
        error: 'Container name or ID not specified'
      };
    }

    try {
      // 获取容器对象
      const containerObj = this.docker.getContainer(container);

      // 创建exec实例
      const exec = await containerObj.exec({
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true
      });

      // 启动exec并获取输出
      const stream = await exec.start({ Detach: false });

      // 收集输出
      let output = '';
      let errorOutput = '';
      const timeout = 300000; // 5 minutes

      return new Promise((resolve) => {
        let resolved = false;
        let timeoutId: NodeJS.Timeout | null = null;

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
              output,
              exitCode: 124,
              error: `Command timed out after ${timeout / 1000} seconds`
            });
          }
        }, timeout);

        stream.on('data', (chunk: Buffer) => {
          const data = chunk.toString();
          // Docker stream format: first 8 bytes are header
          if (chunk.length > 8) {
            const actualData = chunk.slice(8).toString();
            output += actualData;
          } else {
            output += data;
          }
        });

        stream.on('end', async () => {
          cleanup();
          if (resolved) return;
          resolved = true;
          try {
            const inspectData = await exec.inspect();
            resolve({
              timestamp: startTime,
              command,
              output: output || errorOutput,
              exitCode: inspectData.ExitCode || 0,
              error: errorOutput || undefined
            });
          } catch (error) {
            resolve({
              timestamp: startTime,
              command,
              output,
              exitCode: 0,
              error: undefined
            });
          }
        });

        stream.on('error', (error: Error) => {
          cleanup();
          if (resolved) return;
          resolved = true;
          resolve({
            timestamp: startTime,
            command,
            output,
            exitCode: 1,
            error: error.message
          });
        });
      });
    } catch (error: any) {
      return {
        timestamp: startTime,
        command,
        output: '',
        exitCode: 1,
        error: this.formatDockerRemoteError(error)
      };
    }
  }

  private formatDockerRemoteError(error: any): string {
    const message = error.message || error.toString();

    if (message.includes('ECONNREFUSED')) {
      return `Cannot connect to Docker API at ${this.config.dockerApiHost}:${this.config.dockerApiPort || 2376}. Please check if Docker Remote API is enabled.`;
    }
    if (message.includes('ENOTFOUND')) {
      return `Docker API host '${this.config.dockerApiHost}' not found. Please check the hostname.`;
    }
    if (message.includes('No such container')) {
      return `Container '${this.config.containerId || this.config.containerName}' not found.`;
    }
    if (message.includes('certificate')) {
      return 'TLS certificate error. Please check your certificates.';
    }

    return message;
  }

  disconnect(): void {
    // Docker Remote API 不需要显式断开连接
  }
}

// Kubernetes Pod 执行器
class KubernetesExecutor implements ConnectionExecutor {
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async execute(command: string): Promise<ExecutionLog> {
    const startTime = new Date();
    const { podName, namespace, k8sContainerName } = this.config;

    if (!podName) {
      return {
        timestamp: startTime,
        command,
        output: '',
        exitCode: 1,
        error: 'Pod name not specified'
      };
    }

    // Escape command for shell execution
    const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

    let kubectlCommand = `kubectl exec ${podName}`;
    if (namespace) {
      kubectlCommand += ` -n ${namespace}`;
    }
    if (k8sContainerName) {
      kubectlCommand += ` -c ${k8sContainerName}`;
    }

    // Try with bash first, fallback to sh if bash is not available
    kubectlCommand += ` -- bash -c "${escapedCommand}"`;

    try {
      const { stdout, stderr } = await execAsync(kubectlCommand, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000
      });

      return {
        timestamp: startTime,
        command,
        output: stdout || stderr,
        exitCode: 0,
        error: stderr || undefined
      };
    } catch (error: any) {
      // If bash failed, try with sh
      if (error.message?.includes('executable file not found') || error.message?.includes('bash')) {
        try {
          let shCommand = `kubectl exec ${podName}`;
          if (namespace) {
            shCommand += ` -n ${namespace}`;
          }
          if (k8sContainerName) {
            shCommand += ` -c ${k8sContainerName}`;
          }
          shCommand += ` -- sh -c "${escapedCommand}"`;

          const { stdout, stderr } = await execAsync(shCommand, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 300000
          });

          return {
            timestamp: startTime,
            command,
            output: stdout || stderr,
            exitCode: 0,
            error: stderr || undefined
          };
        } catch (shError: any) {
          return {
            timestamp: startTime,
            command,
            output: shError.stdout || '',
            exitCode: shError.code || 1,
            error: this.formatKubernetesError(shError)
          };
        }
      }

      return {
        timestamp: startTime,
        command,
        output: error.stdout || '',
        exitCode: error.code || 1,
        error: this.formatKubernetesError(error)
      };
    }
  }

  private formatKubernetesError(error: any): string {
    const message = error.stderr || error.message || '';

    if (message.includes('not found')) {
      return `Pod '${this.config.podName}' not found in namespace '${this.config.namespace || 'default'}'. Please check if the pod exists.`;
    }
    if (message.includes('Pending') || message.includes('not ready')) {
      return `Pod '${this.config.podName}' is not ready. Please wait for the pod to be in Running state.`;
    }
    if (message.includes('Unable to connect to the server')) {
      return 'Cannot connect to Kubernetes cluster. Please check your kubectl configuration.';
    }
    if (message.includes('command not found') || message.includes('kubectl: not found')) {
      return 'kubectl command not found. Please install kubectl first.';
    }
    if (message.includes('container') && message.includes('not found')) {
      return `Container '${this.config.containerName}' not found in pod '${this.config.podName}'.`;
    }

    return message;
  }

  disconnect(): void {
    // Kubernetes 执行器不需要断开连接
  }
}

// WSL 执行器
class WSLExecutor implements ConnectionExecutor {
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async execute(command: string): Promise<ExecutionLog> {
    const startTime = new Date();
    const distribution = this.config.distributionName || 'Ubuntu';

    // Escape command for shell execution
    const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

    // Try with bash first, fallback to sh if bash is not available
    let wslCommand = `wsl -d ${distribution} -- bash -c "${escapedCommand}"`;

    try {
      const { stdout, stderr } = await execAsync(wslCommand, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000
      });

      return {
        timestamp: startTime,
        command,
        output: stdout || stderr,
        exitCode: 0,
        error: stderr || undefined
      };
    } catch (error: any) {
      // If bash failed, try with sh
      if (error.message?.includes('executable file not found') || error.message?.includes('bash')) {
        try {
          wslCommand = `wsl -d ${distribution} -- sh -c "${escapedCommand}"`;
          const { stdout, stderr } = await execAsync(wslCommand, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 300000
          });

          return {
            timestamp: startTime,
            command,
            output: stdout || stderr,
            exitCode: 0,
            error: stderr || undefined
          };
        } catch (shError: any) {
          return {
            timestamp: startTime,
            command,
            output: shError.stdout || '',
            exitCode: shError.code || 1,
            error: this.formatWSLError(shError, distribution)
          };
        }
      }

      return {
        timestamp: startTime,
        command,
        output: error.stdout || '',
        exitCode: error.code || 1,
        error: this.formatWSLError(error, distribution)
      };
    }
  }

  private formatWSLError(error: any, distribution: string): string {
    const message = error.stderr || error.message || '';

    if (message.includes('distribution') && message.includes('not found')) {
      return `WSL distribution '${distribution}' not found. Use 'wsl -l' to list available distributions.`;
    }
    if (message.includes('WSL 2') && message.includes('kernel')) {
      return 'WSL 2 kernel not found. Please update WSL or install the kernel component.';
    }
    if (message.includes('command not found') || message.includes('wsl: not found')) {
      return 'WSL command not found. Please install WSL first (Windows 10/11 only).';
    }
    if (message.includes('not installed')) {
      return `WSL distribution '${distribution}' is not installed. Please install it first.`;
    }
    if (message.includes('stopped') || message.includes('terminated')) {
      return `WSL distribution '${distribution}' has stopped. Try running 'wsl -d ${distribution}' to start it.`;
    }

    return message;
  }

  disconnect(): void {
    // WSL 执行器不需要断开连接
  }
}
