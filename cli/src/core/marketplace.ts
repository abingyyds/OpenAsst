import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { CommandScript } from '../types';

const DATA_DIR = path.join(os.homedir(), '.openasst-cli');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');
const DEFAULT_API_URL = 'https://openasst.ai';

export class Marketplace {
  private scripts: CommandScript[] = [];
  private apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.OPENASST_API_URL || DEFAULT_API_URL;
    this.loadScripts();
  }

  private loadScripts(): void {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(SCRIPTS_FILE)) {
        const data = fs.readFileSync(SCRIPTS_FILE, 'utf-8');
        this.scripts = JSON.parse(data);
      } else {
        this.scripts = this.getDefaultScripts();
        this.saveScripts();
      }
    } catch (error) {
      this.scripts = this.getDefaultScripts();
    }
  }

  private saveScripts(): void {
    const dir = path.dirname(SCRIPTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(this.scripts, null, 2));
  }

  private getDefaultScripts(): CommandScript[] {
    return [
      {
        id: 'sys-info',
        name: 'System Info',
        description: 'Display basic system information',
        commands: process.platform === 'win32'
          ? ['systeminfo | findstr /B /C:"OS Name" /C:"OS Version"']
          : ['uname -a', 'cat /etc/os-release 2>/dev/null || sw_vers'],
        category: 'monitoring',
        tags: ['system', 'info']
      },
      {
        id: 'disk-usage',
        name: 'Disk Usage',
        description: 'View disk space usage',
        commands: process.platform === 'win32'
          ? ['wmic logicaldisk get size,freespace,caption']
          : ['df -h'],
        category: 'monitoring',
        tags: ['disk', 'storage']
      },
      {
        id: 'network-info',
        name: 'Network Info',
        description: 'Display network configuration',
        commands: process.platform === 'win32'
          ? ['ipconfig']
          : ['ifconfig || ip addr'],
        category: 'network',
        tags: ['network', 'ip']
      }
    ];
  }

  getAll(): CommandScript[] {
    return this.scripts;
  }

  getById(id: string): CommandScript | undefined {
    return this.scripts.find(s => s.id === id);
  }

  search(keyword: string): CommandScript[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.scripts.filter(s =>
      s.name.toLowerCase().includes(lowerKeyword) ||
      s.description.toLowerCase().includes(lowerKeyword) ||
      s.tags?.some(tag => tag.toLowerCase().includes(lowerKeyword))
    );
  }

  // Sync scripts from web API
  async sync(): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const response = await axios.get(`${this.apiUrl}/api/scripts`, {
        timeout: 10000
      });

      if (response.data && Array.isArray(response.data)) {
        // Convert API response to CommandScript format
        const remoteScripts: CommandScript[] = response.data.map((script: any) => ({
          id: script.id || script._id,
          name: script.name,
          description: script.description,
          commands: script.commands || [],
          category: script.category || 'custom',
          tags: script.tags || [],
          documentContent: script.documentContent,
          documentType: script.documentType
        }));

        // Merge with local default scripts
        const defaultScripts = this.getDefaultScripts();
        const mergedScripts = [...defaultScripts];

        // Add remote scripts that don't conflict with defaults
        for (const remote of remoteScripts) {
          if (!mergedScripts.find(s => s.id === remote.id)) {
            mergedScripts.push(remote);
          }
        }

        this.scripts = mergedScripts;
        this.saveScripts();

        return {
          success: true,
          count: remoteScripts.length,
          message: `Synced ${remoteScripts.length} scripts from server`
        };
      }

      return { success: false, count: 0, message: 'Invalid response from server' };
    } catch (error: any) {
      return {
        success: false,
        count: 0,
        message: error.code === 'ECONNREFUSED'
          ? 'Cannot connect to server. Is the backend running?'
          : error.message
      };
    }
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  // Save execution experience to knowledge base
  async learnFromExecution(
    task: string,
    commands: string[],
    result: string,
    success: boolean
  ): Promise<{ learned: boolean; message: string }> {
    if (!success) {
      return { learned: false, message: 'Only successful executions are saved' };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/api/knowledge/learn`,
        { task, commands, result, success },
        { timeout: 10000 }
      );

      if (response.data?.learned) {
        return { learned: true, message: 'Experience saved to knowledge base' };
      }
      return { learned: false, message: response.data?.message || 'Already exists' };
    } catch (error: any) {
      // Silently fail - don't interrupt user experience
      return { learned: false, message: error.message };
    }
  }

  // Search scripts from API by keyword (auto-fetch)
  async searchFromApi(keyword: string): Promise<CommandScript[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/api/scripts/search`, {
        params: { q: keyword },
        timeout: 5000
      });

      if (response.data && Array.isArray(response.data)) {
        return response.data.map((script: any) => ({
          id: script.id || script._id,
          name: script.name,
          description: script.description,
          commands: script.commands || [],
          category: script.category || 'custom',
          tags: script.tags || [],
          documentContent: script.document_content || script.documentContent,
          documentType: script.document_type || script.documentType
        }));
      }
      return [];
    } catch (error) {
      // Fallback to local search if API fails
      return this.search(keyword);
    }
  }
}
