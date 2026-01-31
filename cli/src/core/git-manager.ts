import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

export interface GitRepoInfo {
  url: string;
  name: string;
  branch: string;
  localPath: string;
}

export interface CloneOptions {
  branch?: string;
  depth?: number;
  targetDir?: string;
}

export class GitManager {
  private executor: CommandExecutor;

  constructor() {
    this.executor = new CommandExecutor();
  }

  /**
   * Check if Git is installed
   */
  async checkGitInstalled(): Promise<boolean> {
    const log = await this.executor.execute('git --version');
    return log.exitCode === 0;
  }

  /**
   * Clone repository
   */
  async clone(url: string, options: CloneOptions = {}): Promise<GitRepoInfo | null> {
    const repoName = this.extractRepoName(url);
    const targetDir = options.targetDir || path.join(process.cwd(), repoName);
    const branch = options.branch || 'main';

    // Build clone command
    let cmd = `git clone`;
    if (options.branch) {
      cmd += ` -b ${options.branch}`;
    }
    if (options.depth) {
      cmd += ` --depth ${options.depth}`;
    }
    cmd += ` "${url}" "${targetDir}"`;

    Logger.info(`Cloning repository: ${url}`);
    const log = await this.executor.execute(cmd);

    if (log.exitCode !== 0) {
      // Try using master branch
      if (options.branch === 'main') {
        return this.clone(url, { ...options, branch: 'master' });
      }
      Logger.error(`Clone failed: ${log.error || log.output}`);
      return null;
    }

    Logger.success(`Clone successful: ${targetDir}`);

    return {
      url,
      name: repoName,
      branch,
      localPath: targetDir
    };
  }

  /**
   * Pull updates
   */
  async pull(repoPath: string): Promise<boolean> {
    const cmd = `cd "${repoPath}" && git pull`;
    const log = await this.executor.execute(cmd);

    if (log.exitCode === 0) {
      Logger.success('Pull successful');
      return true;
    }

    Logger.error(`Pull failed: ${log.error || log.output}`);
    return false;
  }

  /**
   * Get repository info
   */
  async getRepoInfo(repoPath: string): Promise<any> {
    const info: any = {};

    // Get remote URL
    const urlLog = await this.executor.execute(
      `cd "${repoPath}" && git remote get-url origin`
    );
    if (urlLog.exitCode === 0) {
      info.url = urlLog.output.trim();
    }

    // Get current branch
    const branchLog = await this.executor.execute(
      `cd "${repoPath}" && git branch --show-current`
    );
    if (branchLog.exitCode === 0) {
      info.branch = branchLog.output.trim();
    }

    // Get latest commit
    const commitLog = await this.executor.execute(
      `cd "${repoPath}" && git log -1 --format="%H %s"`
    );
    if (commitLog.exitCode === 0) {
      const [hash, ...msg] = commitLog.output.trim().split(' ');
      info.lastCommit = { hash, message: msg.join(' ') };
    }

    return info;
  }

  /**
   * Extract repo name from URL
   */
  private extractRepoName(url: string): string {
    const match = url.match(/\/([^\/]+?)(\.git)?$/);
    return match ? match[1] : 'repo';
  }
}
