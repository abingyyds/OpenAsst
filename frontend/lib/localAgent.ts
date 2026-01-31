// 本地代理连接工具

const LOCAL_AGENT_URL = 'http://127.0.0.1:3003';
const LOCAL_AGENT_WS = 'ws://127.0.0.1:3003';

export interface AgentInfo {
  version: string;
  platform: string;
  hostname: string;
  username: string;
}

// 检查本地代理是否运行
export async function checkLocalAgent(): Promise<AgentInfo | null> {
  try {
    const response = await fetch(`${LOCAL_AGENT_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      const info = await fetch(`${LOCAL_AGENT_URL}/info`);
      return await info.json();
    }
    return null;
  } catch {
    return null;
  }
}

// WebSocket 连接类
export class LocalAgentConnection {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private callbacks: Map<number, (data: any) => void> = new Map();
  private onOutput: ((data: string) => void) | null = null;

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(LOCAL_AGENT_WS);

        this.ws.onopen = () => {
          console.log('[LocalAgent] 已连接');
          resolve(true);
        };

        this.ws.onerror = () => {
          console.log('[LocalAgent] 连接失败');
          resolve(false);
        };

        this.ws.onclose = () => {
          console.log('[LocalAgent] 连接关闭');
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (e) {
            console.error('[LocalAgent] 解析消息失败', e);
          }
        };
      } catch {
        resolve(false);
      }
    });
  }

  private handleMessage(data: any) {
    const { type, id } = data;

    // 处理输出流
    if (type === 'stdout' || type === 'stderr') {
      this.onOutput?.(data.data);
    }

    // 处理回调
    if (type === 'exit' || type === 'error' || type === 'info' || type === 'pong') {
      const callback = this.callbacks.get(id);
      if (callback) {
        callback(data);
        this.callbacks.delete(id);
      }
    }
  }

  setOutputHandler(handler: (data: string) => void) {
    this.onOutput = handler;
  }

  async exec(command: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('未连接'));
        return;
      }

      const id = ++this.messageId;
      this.callbacks.set(id, (data) => {
        if (data.type === 'exit') {
          resolve({ code: data.code, stdout: data.stdout, stderr: data.stderr });
        } else if (data.type === 'error') {
          reject(new Error(data.error));
        }
      });

      this.ws.send(JSON.stringify({ type: 'exec', id, command }));
    });
  }

  async getInfo(): Promise<AgentInfo> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('未连接'));
        return;
      }

      const id = ++this.messageId;
      this.callbacks.set(id, (data) => {
        if (data.type === 'info') {
          resolve(data.data);
        }
      });

      this.ws.send(JSON.stringify({ type: 'info', id }));
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// 获取安装命令
export function getInstallCommand(platform: 'unix' | 'windows'): string {
  if (platform === 'windows') {
    return 'curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/local-agent/install.bat -o install.bat && install.bat';
  }
  return 'curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/local-agent/install.sh | bash';
}
