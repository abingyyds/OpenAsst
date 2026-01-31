import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  commands: SkillCommand[];
  dependencies?: string[];
  installedAt?: string;
}

export interface SkillCommand {
  name: string;
  description: string;
  action: string;  // Command template or script
  params?: SkillParam[];
}

export interface SkillParam {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export class SkillManager {
  private skillsDir: string;
  private skillsIndexPath: string;
  private executor: CommandExecutor;

  constructor() {
    this.skillsDir = path.join(os.homedir(), '.openasst-cli', 'skills');
    this.skillsIndexPath = path.join(this.skillsDir, 'index.json');
    this.executor = new CommandExecutor();
    this.ensureSkillsDir();
  }

  private ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    if (!fs.existsSync(this.skillsIndexPath)) {
      fs.writeFileSync(this.skillsIndexPath, JSON.stringify({ skills: [] }, null, 2));
    }
  }

  /**
   * Get all installed skills
   */
  getInstalledSkills(): Skill[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.skillsIndexPath, 'utf-8'));
      return data.skills || [];
    } catch {
      return [];
    }
  }

  /**
   * Install a skill from definition
   */
  async installSkill(skill: Skill): Promise<boolean> {
    const skills = this.getInstalledSkills();

    // Check if already installed
    const existing = skills.find(s => s.id === skill.id);
    if (existing) {
      Logger.warning(`Skill "${skill.id}" is already installed`);
      return false;
    }

    // Install dependencies if any
    if (skill.dependencies && skill.dependencies.length > 0) {
      Logger.info('Installing dependencies...');
      for (const dep of skill.dependencies) {
        const result = await this.executor.execute(dep);
        if (result.exitCode !== 0) {
          Logger.error(`Failed to install dependency: ${dep}`);
          return false;
        }
      }
    }

    // Add to index
    skill.installedAt = new Date().toISOString();
    skills.push(skill);

    fs.writeFileSync(this.skillsIndexPath, JSON.stringify({ skills }, null, 2));
    Logger.success(`Skill "${skill.name}" installed successfully`);
    return true;
  }

  /**
   * Uninstall a skill
   */
  uninstallSkill(skillId: string): boolean {
    const skills = this.getInstalledSkills();
    const index = skills.findIndex(s => s.id === skillId);

    if (index === -1) {
      Logger.error(`Skill "${skillId}" not found`);
      return false;
    }

    skills.splice(index, 1);
    fs.writeFileSync(this.skillsIndexPath, JSON.stringify({ skills }, null, 2));
    Logger.success(`Skill "${skillId}" uninstalled`);
    return true;
  }

  /**
   * Execute a skill command
   */
  async executeSkillCommand(
    skillId: string,
    commandName: string,
    params: { [key: string]: string } = {}
  ): Promise<{ success: boolean; output: string }> {
    const skills = this.getInstalledSkills();
    const skill = skills.find(s => s.id === skillId);

    if (!skill) {
      return { success: false, output: `Skill "${skillId}" not found` };
    }

    const command = skill.commands.find(c => c.name === commandName);
    if (!command) {
      return { success: false, output: `Command "${commandName}" not found in skill` };
    }

    // Replace parameters in action template
    let action = command.action;
    for (const [key, value] of Object.entries(params)) {
      action = action.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Check for missing required params
    const missingParams = action.match(/\{\{(\w+)\}\}/g);
    if (missingParams) {
      return {
        success: false,
        output: `Missing parameters: ${missingParams.join(', ')}`
      };
    }

    Logger.command(action);
    const result = await this.executor.execute(action);

    return {
      success: result.exitCode === 0,
      output: result.output || result.error || ''
    };
  }

  /**
   * Get built-in skills
   */
  getBuiltinSkills(): Skill[] {
    return [
      {
        id: 'git-ops',
        name: 'Git Operations',
        description: 'Common Git operations',
        version: '1.0.0',
        commands: [
          { name: 'status', description: 'Show git status', action: 'git status' },
          { name: 'pull', description: 'Pull latest changes', action: 'git pull' },
          { name: 'push', description: 'Push changes', action: 'git push' },
          { name: 'commit', description: 'Commit changes', action: 'git add -A && git commit -m "{{message}}"', params: [{ name: 'message', description: 'Commit message', required: true }] }
        ]
      },
      {
        id: 'docker-ops',
        name: 'Docker Operations',
        description: 'Common Docker operations',
        version: '1.0.0',
        commands: [
          { name: 'ps', description: 'List containers', action: 'docker ps -a' },
          { name: 'images', description: 'List images', action: 'docker images' },
          { name: 'stop-all', description: 'Stop all containers', action: 'docker stop $(docker ps -q)' },
          { name: 'prune', description: 'Clean up unused resources', action: 'docker system prune -f' }
        ]
      },
      {
        id: 'system-ops',
        name: 'System Operations',
        description: 'System maintenance operations',
        version: '1.0.0',
        commands: [
          { name: 'update', description: 'Update system packages', action: 'sudo apt update && sudo apt upgrade -y || brew update && brew upgrade' },
          { name: 'clean', description: 'Clean system cache', action: 'sudo apt autoremove -y && sudo apt clean || brew cleanup' },
          { name: 'disk', description: 'Show disk usage', action: 'df -h' },
          { name: 'memory', description: 'Show memory usage', action: 'free -h || vm_stat' }
        ]
      }
    ];
  }

  /**
   * Install all built-in skills
   */
  async installBuiltinSkills(): Promise<void> {
    const builtins = this.getBuiltinSkills();
    for (const skill of builtins) {
      await this.installSkill(skill);
    }
  }
}
