import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../types';
import { ProjectInfo, ConfigFile } from './project-analyzer';

export interface ConfigChange {
  file: string;
  key: string;
  oldValue: any;
  newValue: any;
  description: string;
}

export class ConfigManager {
  private client: Anthropic;
  private model: string;

  constructor(config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Read config file
   */
  readConfig(filePath: string): any {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.json':
        return JSON.parse(content);
      case '.yaml':
      case '.yml':
        return this.parseYaml(content);
      case '.env':
        return this.parseEnv(content);
      default:
        return content;
    }
  }

  /**
   * Write config file
   */
  writeConfig(filePath: string, data: any): void {
    const ext = path.extname(filePath).toLowerCase();
    let content: string;

    switch (ext) {
      case '.json':
        content = JSON.stringify(data, null, 2);
        break;
      case '.yaml':
      case '.yml':
        content = this.stringifyYaml(data);
        break;
      case '.env':
        content = this.stringifyEnv(data);
        break;
      default:
        content = typeof data === 'string' ? data : JSON.stringify(data);
    }

    fs.writeFileSync(filePath, content);
  }

  /**
   * Update config item
   */
  updateConfig(filePath: string, key: string, value: any): ConfigChange {
    const data = this.readConfig(filePath);
    const oldValue = this.getNestedValue(data, key);

    this.setNestedValue(data, key, value);
    this.writeConfig(filePath, data);

    return {
      file: filePath,
      key,
      oldValue,
      newValue: value,
      description: `Updated ${key}: ${oldValue} -> ${value}`
    };
  }

  /**
   * Batch update config
   */
  async batchUpdate(
    filePath: string,
    changes: { key: string; value: any }[]
  ): Promise<ConfigChange[]> {
    const results: ConfigChange[] = [];
    const data = this.readConfig(filePath);

    for (const { key, value } of changes) {
      const oldValue = this.getNestedValue(data, key);
      this.setNestedValue(data, key, value);
      results.push({
        file: filePath,
        key,
        oldValue,
        newValue: value,
        description: `Updated ${key}`
      });
    }

    this.writeConfig(filePath, data);
    return results;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const last = keys.pop()!;
    const target = keys.reduce((o, k) => {
      if (!(k in o)) o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  }

  private parseYaml(content: string): any {
    // Simple YAML parsing
    const result: any = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        result[key] = value.trim() || true;
      }
    }

    return result;
  }

  private stringifyYaml(data: any): string {
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  private parseEnv(content: string): any {
    const result: any = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        result[match[1].trim()] = match[2].trim();
      }
    }

    return result;
  }

  private stringifyEnv(data: any): string {
    return Object.entries(data)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
  }
}
