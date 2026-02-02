import WebSocket from 'ws';
import { AgentConfig } from './config';
import { Executor, ExecutionResult } from './executor';
import chalk from 'chalk';

export type MessageType =
  | 'auth'
  | 'auth_result'
  | 'heartbeat'
  | 'heartbeat_ack'
  | 'command'
  | 'command_result'
  | 'status'
  | 'error';

export interface WSMessage {
  type: MessageType;
  taskId?: string;
  payload: any;
  timestamp: number;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private config: AgentConfig;
  private executor: Executor;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.executor = new Executor();
  }

  async connect(): Promise<void> {
    const url = `ws://${this.config.masterHost}:${this.config.masterPort}`;
    console.log(chalk.cyan(`Connecting to Master: ${url}`));

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log(chalk.green('Connected to Master'));
        this.isConnected = true;
        this.authenticate();
        this.startHeartbeat();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        console.log(chalk.yellow('Disconnected from Master'));
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.log(chalk.red(`Connection error: ${error.message}`));
        reject(error);
      });
    });
  }

  private authenticate(): void {
    this.send({
      type: 'auth',
      payload: {
        agentName: this.config.agentName,
        secretKey: this.config.secretKey
      },
      timestamp: Date.now()
    });
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      const msg: WSMessage = JSON.parse(data);

      switch (msg.type) {
        case 'auth_result':
          if (msg.payload.success) {
            console.log(chalk.green('Authentication successful'));
          } else {
            console.log(chalk.red(`Authentication failed: ${msg.payload.error}`));
          }
          break;

        case 'heartbeat_ack':
          // Heartbeat acknowledged
          break;

        case 'command':
          await this.executeCommand(msg);
          break;

        default:
          console.log(chalk.gray(`Unknown message type: ${msg.type}`));
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private async executeCommand(msg: WSMessage): Promise<void> {
    const { command } = msg.payload;
    console.log(chalk.cyan(`Executing: ${command}`));

    const result = await this.executor.execute(command);

    this.send({
      type: 'command_result',
      taskId: msg.taskId,
      payload: {
        deviceName: this.config.agentName,
        ...result
      },
      timestamp: Date.now()
    });

    const status = result.success ? chalk.green('OK') : chalk.red('FAIL');
    console.log(`${status} (${result.duration}ms)`);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: 'heartbeat',
          payload: { agentName: this.config.agentName },
          timestamp: Date.now()
        });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    console.log(chalk.yellow(`Reconnecting in ${this.config.reconnectInterval}ms...`));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, this.config.reconnectInterval);
  }

  private send(msg: WSMessage): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
