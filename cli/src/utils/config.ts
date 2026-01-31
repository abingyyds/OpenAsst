import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.openasst-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export class ConfigManager {
  private static ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  static load(): Config | null {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return null;
      }
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  static save(config: Config): void {
    this.ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  static getConfigPath(): string {
    return CONFIG_FILE;
  }
}
