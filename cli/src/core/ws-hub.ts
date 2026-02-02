import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from '../utils/logger';
import { DeviceManager } from './device-manager';
import * as crypto from 'crypto';

export interface AgentConnection {
  id: string;
  name: string;
  ws: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  authenticated: boolean;
}

export interface WSMessage {
  type: string;
  taskId?: string;
  payload: any;
  timestamp: number;
}

export class WSHub {
  private wss: WebSocketServer | null = null;
  private agents: Map<string, AgentConnection> = new Map();
  private deviceManager: DeviceManager;
  private port: number;
  private secretKey: string;
  private pendingResults: Map<string, any[]> = new Map();
  private resultCallbacks: Map<string, (results: any[]) => void> = new Map();

  constructor() {
    this.deviceManager = new DeviceManager();
    this.port = this.deviceManager.getMasterPort();
    this.secretKey = this.deviceManager.getSecretKey();
  }

  start(): void {
    if (this.wss) {
      Logger.warning('Hub already running');
      return;
    }

    this.wss = new WebSocketServer({ port: this.port });
    Logger.success(`WebSocket Hub started on port ${this.port}`);

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error) => {
      Logger.error(`Hub error: ${error.message}`);
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.agents.clear();
      Logger.success('Hub stopped');
    }
  }

  isRunning(): boolean {
    return this.wss !== null;
  }

  getOnlineAgents(): AgentConnection[] {
    return Array.from(this.agents.values())
      .filter(a => a.authenticated);
  }

  getAgentByName(name: string): AgentConnection | undefined {
    for (const agent of this.agents.values()) {
      if (agent.name === name) return agent;
    }
    return undefined;
  }

  private handleConnection(ws: WebSocket): void {
    const connId = crypto.randomBytes(8).toString('hex');
    const conn: AgentConnection = {
      id: connId,
      name: '',
      ws,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      authenticated: false
    };

    this.agents.set(connId, conn);
    Logger.info(`New connection: ${connId}`);

    ws.on('message', (data) => {
      this.handleMessage(conn, data.toString());
    });

    ws.on('close', () => {
      this.agents.delete(connId);
      if (conn.name) {
        Logger.info(`Agent disconnected: ${conn.name}`);
      }
    });

    ws.on('error', (error) => {
      Logger.error(`Connection error: ${error.message}`);
    });
  }

  private handleMessage(conn: AgentConnection, data: string): void {
    try {
      const msg: WSMessage = JSON.parse(data);

      switch (msg.type) {
        case 'auth':
          this.handleAuth(conn, msg);
          break;
        case 'heartbeat':
          this.handleHeartbeat(conn);
          break;
        case 'command_result':
          this.handleCommandResult(msg);
          break;
      }
    } catch (error) {
      Logger.error(`Message parse error: ${(error as Error).message}`);
    }
  }

  private handleAuth(conn: AgentConnection, msg: WSMessage): void {
    const { agentName, secretKey } = msg.payload;

    if (secretKey === this.secretKey) {
      conn.authenticated = true;
      conn.name = agentName;
      Logger.success(`Agent authenticated: ${agentName}`);

      this.send(conn.ws, {
        type: 'auth_result',
        payload: { success: true },
        timestamp: Date.now()
      });
    } else {
      this.send(conn.ws, {
        type: 'auth_result',
        payload: { success: false, error: 'Invalid secret key' },
        timestamp: Date.now()
      });
    }
  }

  private handleHeartbeat(conn: AgentConnection): void {
    conn.lastHeartbeat = new Date();
    this.send(conn.ws, {
      type: 'heartbeat_ack',
      payload: {},
      timestamp: Date.now()
    });
  }

  private handleCommandResult(msg: WSMessage): void {
    if (!msg.taskId) return;

    const results = this.pendingResults.get(msg.taskId) || [];
    results.push(msg.payload);
    this.pendingResults.set(msg.taskId, results);

    // Check if all results received
    const callback = this.resultCallbacks.get(msg.taskId);
    if (callback) {
      callback(results);
    }
  }

  async broadcast(
    command: string,
    targetNames: string[],
    timeout: number = 60000
  ): Promise<any[]> {
    const taskId = crypto.randomBytes(8).toString('hex');
    const targets = targetNames.length > 0
      ? this.getOnlineAgents().filter(a => targetNames.includes(a.name))
      : this.getOnlineAgents();

    if (targets.length === 0) {
      Logger.warning('No online agents');
      return [];
    }

    this.pendingResults.set(taskId, []);

    // Send command to all targets
    for (const agent of targets) {
      this.send(agent.ws, {
        type: 'command',
        taskId,
        payload: { command },
        timestamp: Date.now()
      });
    }

    // Wait for results
    return new Promise((resolve) => {
      const results: any[] = [];
      let received = 0;

      const checkComplete = (newResults: any[]) => {
        received = newResults.length;
        if (received >= targets.length) {
          cleanup();
          resolve(newResults);
        }
      };

      const cleanup = () => {
        this.resultCallbacks.delete(taskId);
        this.pendingResults.delete(taskId);
        clearTimeout(timer);
      };

      this.resultCallbacks.set(taskId, checkComplete);

      const timer = setTimeout(() => {
        cleanup();
        resolve(this.pendingResults.get(taskId) || []);
      }, timeout);
    });
  }

  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
