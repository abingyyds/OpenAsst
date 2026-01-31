import * as fs from 'fs';
import * as path from 'path';
import { CommandScript } from '../types';

const SCRIPTS_FILE = path.join(__dirname, '../../data/scripts.json');

export class Marketplace {
  private scripts: CommandScript[] = [];

  constructor() {
    this.loadScripts();
  }

  private loadScripts(): void {
    try {
      if (fs.existsSync(SCRIPTS_FILE)) {
        const data = fs.readFileSync(SCRIPTS_FILE, 'utf-8');
        this.scripts = JSON.parse(data);
      } else {
        // Create default scripts
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
}
