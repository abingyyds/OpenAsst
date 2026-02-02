import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AgentConfig {
  masterHost: string;
  masterPort: number;
  secretKey: string;
  agentName: string;
  reconnectInterval: number;
  heartbeatInterval: number;
}

const CONFIG_PATH = '/etc/openasst/agent.json';
const CONFIG_PATH_USER = path.join(os.homedir(), '.openasst-agent', 'config.json');

export function loadConfig(): AgentConfig {
  // Try system config first, then user config
  const configPath = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : CONFIG_PATH_USER;

  if (fs.existsSync(configPath)) {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      masterHost: data.masterHost || 'localhost',
      masterPort: data.masterPort || 9527,
      secretKey: data.secretKey || '',
      agentName: data.agentName || os.hostname(),
      reconnectInterval: data.reconnectInterval || 5000,
      heartbeatInterval: data.heartbeatInterval || 30000
    };
  }

  // Default config
  return {
    masterHost: 'localhost',
    masterPort: 9527,
    secretKey: '',
    agentName: os.hostname(),
    reconnectInterval: 5000,
    heartbeatInterval: 30000
  };
}

export function saveConfig(config: AgentConfig): void {
  const configDir = path.dirname(CONFIG_PATH_USER);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH_USER, JSON.stringify(config, null, 2));
}

export function getConfigPath(): string {
  return fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : CONFIG_PATH_USER;
}
