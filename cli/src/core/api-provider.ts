import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from '../types';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';

export interface APIExport {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  exportedAt: string;
  expiresAt?: string;
}

export interface SharedAPIConfig {
  openasst: APIExport;
  targets: {
    [key: string]: {
      configPath: string;
      format: 'env' | 'json' | 'yaml';
      keyMapping: { [key: string]: string };
    };
  };
}

export class APIProvider {
  private configDir: string;
  private sharedConfigPath: string;

  // Known AI tools and their config locations
  private knownTools: { [key: string]: { configPath: string; format: 'env' | 'json'; keyMapping: { [key: string]: string } } } = {
    'claude-code': {
      configPath: path.join(os.homedir(), '.claude', 'settings.json'),
      format: 'json',
      keyMapping: {
        apiKey: 'apiKey',
        baseUrl: 'apiBaseUrl',
        model: 'model'
      }
    },
    'cursor': {
      configPath: path.join(os.homedir(), '.cursor', 'settings.json'),
      format: 'json',
      keyMapping: {
        apiKey: 'anthropic.apiKey',
        baseUrl: 'anthropic.baseUrl'
      }
    },
    'continue': {
      configPath: path.join(os.homedir(), '.continue', 'config.json'),
      format: 'json',
      keyMapping: {
        apiKey: 'models[0].apiKey',
        baseUrl: 'models[0].apiBase'
      }
    },
    'aider': {
      configPath: path.join(os.homedir(), '.aider.conf.yml'),
      format: 'env',
      keyMapping: {
        apiKey: 'ANTHROPIC_API_KEY',
        baseUrl: 'ANTHROPIC_BASE_URL'
      }
    },
    'shell-env': {
      configPath: path.join(os.homedir(), '.bashrc'),
      format: 'env',
      keyMapping: {
        apiKey: 'ANTHROPIC_API_KEY',
        baseUrl: 'ANTHROPIC_BASE_URL',
        model: 'ANTHROPIC_MODEL'
      }
    }
  };

  constructor() {
    this.configDir = path.join(os.homedir(), '.openasst-cli');
    this.sharedConfigPath = path.join(this.configDir, 'shared-api.json');
  }

  /**
   * Get current API configuration
   */
  getAPIConfig(): Config | null {
    return ConfigManager.load();
  }

  /**
   * Export API configuration for sharing
   */
  exportAPI(): APIExport | null {
    const config = this.getAPIConfig();
    if (!config) {
      Logger.error('No API configuration found. Run "openasst config" first.');
      return null;
    }

    return {
      provider: 'anthropic',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Share API with a specific tool
   */
  async shareWithTool(toolName: string): Promise<boolean> {
    const config = this.getAPIConfig();
    if (!config) {
      Logger.error('No API configuration found');
      return false;
    }

    const tool = this.knownTools[toolName];
    if (!tool) {
      Logger.error(`Unknown tool: ${toolName}`);
      Logger.info('Available tools: ' + Object.keys(this.knownTools).join(', '));
      return false;
    }

    try {
      if (tool.format === 'json') {
        return this.shareAsJSON(tool, config);
      } else {
        return this.shareAsEnv(tool, config);
      }
    } catch (error) {
      Logger.error(`Failed to share API: ${(error as Error).message}`);
      return false;
    }
  }

  private shareAsJSON(
    tool: { configPath: string; keyMapping: { [key: string]: string } },
    config: Config
  ): boolean {
    let existingConfig: any = {};

    // Read existing config if exists
    if (fs.existsSync(tool.configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(tool.configPath, 'utf-8'));
      } catch {
        existingConfig = {};
      }
    }

    // Ensure directory exists
    const dir = path.dirname(tool.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Set values using key mapping
    if (tool.keyMapping.apiKey) {
      this.setNestedValue(existingConfig, tool.keyMapping.apiKey, config.apiKey);
    }
    if (tool.keyMapping.baseUrl && config.baseUrl) {
      this.setNestedValue(existingConfig, tool.keyMapping.baseUrl, config.baseUrl);
    }
    if (tool.keyMapping.model && config.model) {
      this.setNestedValue(existingConfig, tool.keyMapping.model, config.model);
    }

    fs.writeFileSync(tool.configPath, JSON.stringify(existingConfig, null, 2));
    Logger.success(`API shared to: ${tool.configPath}`);
    return true;
  }

  private shareAsEnv(
    tool: { configPath: string; keyMapping: { [key: string]: string } },
    config: Config
  ): boolean {
    const envLines: string[] = [
      '',
      '# OpenAsst Shared API Configuration',
      `# Exported at: ${new Date().toISOString()}`
    ];

    if (tool.keyMapping.apiKey) {
      envLines.push(`export ${tool.keyMapping.apiKey}="${config.apiKey}"`);
    }
    if (tool.keyMapping.baseUrl && config.baseUrl) {
      envLines.push(`export ${tool.keyMapping.baseUrl}="${config.baseUrl}"`);
    }
    if (tool.keyMapping.model && config.model) {
      envLines.push(`export ${tool.keyMapping.model}="${config.model}"`);
    }

    const content = envLines.join('\n') + '\n';

    // Append to file
    fs.appendFileSync(tool.configPath, content);
    Logger.success(`API exported to: ${tool.configPath}`);
    Logger.info('Run "source ' + tool.configPath + '" to apply');
    return true;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * List available tools for API sharing
   */
  listAvailableTools(): string[] {
    return Object.keys(this.knownTools);
  }

  /**
   * Generate environment variables for current shell
   */
  generateEnvExport(): string {
    const config = this.getAPIConfig();
    if (!config) return '';

    const lines = [
      `export ANTHROPIC_API_KEY="${config.apiKey}"`,
    ];

    if (config.baseUrl) {
      lines.push(`export ANTHROPIC_BASE_URL="${config.baseUrl}"`);
    }
    if (config.model) {
      lines.push(`export ANTHROPIC_MODEL="${config.model}"`);
    }

    return lines.join('\n');
  }

  /**
   * Create a temporary API server for other tools
   */
  getAPIEndpoint(): { apiKey: string; baseUrl: string; model: string } | null {
    const config = this.getAPIConfig();
    if (!config) return null;

    return {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.anthropic.com',
      model: config.model || 'claude-3-5-sonnet-20241022'
    };
  }
}
