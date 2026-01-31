import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../types';
import { Logger } from '../utils/logger';

export interface EnvVar {
  key: string;
  value: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
}

export class EnvManager {
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
   * Read .env file
   */
  readEnvFile(filePath: string): Map<string, string> {
    const envMap = new Map<string, string>();

    if (!fs.existsSync(filePath)) {
      return envMap;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        envMap.set(match[1].trim(), match[2].trim());
      }
    }

    return envMap;
  }

  /**
   * Write .env file
   */
  writeEnvFile(filePath: string, vars: Map<string, string>): void {
    const lines: string[] = [];

    for (const [key, value] of vars) {
      lines.push(`${key}=${value}`);
    }

    fs.writeFileSync(filePath, lines.join('\n') + '\n');
  }

  /**
   * Generate .env from .env.example
   */
  async generateFromExample(
    projectPath: string,
    userInputs?: Map<string, string>
  ): Promise<boolean> {
    const examplePath = path.join(projectPath, '.env.example');
    const envPath = path.join(projectPath, '.env');

    if (!fs.existsSync(examplePath)) {
      Logger.warning('.env.example file not found');
      return false;
    }

    const example = this.readEnvFile(examplePath);
    const existing = fs.existsSync(envPath) ? this.readEnvFile(envPath) : new Map();

    // Merge: user input > existing value > example value
    const result = new Map<string, string>();

    for (const [key, exampleValue] of example) {
      if (userInputs?.has(key)) {
        result.set(key, userInputs.get(key)!);
      } else if (existing.has(key)) {
        result.set(key, existing.get(key)!);
      } else {
        result.set(key, exampleValue);
      }
    }

    this.writeEnvFile(envPath, result);
    Logger.success(`Generated .env file (${result.size} variables)`);

    return true;
  }
}
