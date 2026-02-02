import Anthropic from '@anthropic-ai/sdk';
import inquirer from 'inquirer';
import { Config } from '../types';
import { GitManager } from './git-manager';
import { ProjectAnalyzer, ProjectInfo } from './project-analyzer';
import { EnvManager } from './env-manager';
import { MigrationManager } from './migration-manager';
import { SSLManager } from './ssl-manager';
import { CodeModifier, CodeChange } from './code-modifier';
import { CommandExecutor } from './executor';
import { ErrorHandler } from './error-handler';
import { Logger } from '../utils/logger';

export interface AutoDeployConfig {
  source: string;           // Git URL or local path
  branch?: string;
  targetDir?: string;
  envVars?: Map<string, string>;
  domain?: string;
  email?: string;
  autoFix?: boolean;        // Auto fix code errors
  requireConfirm?: boolean; // Code changes require confirmation
}

export interface DeployStage {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message?: string;
}

export class AutoDeployEngine {
  private client: Anthropic;
  private model: string;
  private git: GitManager;
  private analyzer: ProjectAnalyzer;
  private envMgr: EnvManager;
  private migrationMgr: MigrationManager;
  private sslMgr: SSLManager;
  private codeMod: CodeModifier;
  private executor: CommandExecutor;
  private errorHandler: ErrorHandler;

  private stages: DeployStage[] = [];

  constructor(private config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';

    this.git = new GitManager();
    this.analyzer = new ProjectAnalyzer();
    this.envMgr = new EnvManager(config);
    this.migrationMgr = new MigrationManager();
    this.sslMgr = new SSLManager();
    this.codeMod = new CodeModifier(config);
    this.executor = new CommandExecutor();
    this.errorHandler = new ErrorHandler(config);
  }

  /**
   * Full auto deployment
   */
  async deploy(deployConfig: AutoDeployConfig): Promise<boolean> {
    const {
      source,
      branch,
      targetDir,
      autoFix = true,
      requireConfirm = true
    } = deployConfig;

    this.initStages();
    let projectPath = targetDir || process.cwd();
    let projectInfo: ProjectInfo | null = null;

    try {
      // Stage 1: Git clone
      if (source.includes('github.com') || source.includes('gitlab.com') || source.endsWith('.git')) {
        this.updateStage('git', 'running');
        const repo = await this.git.clone(source, { branch, targetDir });
        if (!repo) {
          this.updateStage('git', 'failed', 'Clone failed');
          return false;
        }
        projectPath = repo.localPath;
        this.updateStage('git', 'success');
      } else {
        this.updateStage('git', 'skipped', 'Local project');
        projectPath = source;
      }

      // Stage 2: Project analysis
      this.updateStage('analyze', 'running');
      projectInfo = await this.analyzer.analyze(projectPath);
      Logger.info(`Project type: ${projectInfo.type} (${projectInfo.framework || projectInfo.language})`);
      this.updateStage('analyze', 'success');

      // Stage 3: Environment variables
      this.updateStage('env', 'running');
      await this.envMgr.generateFromExample(projectPath, deployConfig.envVars);
      this.updateStage('env', 'success');

      // Stage 4: Install dependencies
      this.updateStage('deps', 'running');
      const depsOk = await this.installDependencies(projectPath, projectInfo);
      if (!depsOk) {
        this.updateStage('deps', 'failed');
        return false;
      }
      this.updateStage('deps', 'success');

      // Stage 5: Database migration
      this.updateStage('migrate', 'running');
      const migResult = await this.migrationMgr.runMigrations(projectPath, projectInfo);
      if (migResult.success) {
        this.updateStage('migrate', 'success', `${migResult.migrationsRun} migrations`);
      } else {
        this.updateStage('migrate', 'failed');
      }

      // Stage 6: Build
      this.updateStage('build', 'running');
      const buildOk = await this.buildProject(projectPath, projectInfo, autoFix, requireConfirm);
      if (!buildOk) {
        this.updateStage('build', 'failed');
        return false;
      }
      this.updateStage('build', 'success');

      // Stage 7: Start
      this.updateStage('start', 'running');
      const startOk = await this.startProject(projectPath, projectInfo);
      if (!startOk) {
        this.updateStage('start', 'failed');
        return false;
      }
      this.updateStage('start', 'success');

      // Stage 8: SSL (optional)
      if (deployConfig.domain && deployConfig.email) {
        this.updateStage('ssl', 'running');
        await this.sslMgr.obtainCertificate({
          domain: deployConfig.domain,
          email: deployConfig.email
        });
        this.updateStage('ssl', 'success');
      }

      this.printSummary();
      return true;

    } catch (error) {
      Logger.error(`Deployment failed: ${(error as Error).message}`);
      return false;
    }
  }

  private initStages(): void {
    this.stages = [
      { name: 'git', status: 'pending' },
      { name: 'analyze', status: 'pending' },
      { name: 'env', status: 'pending' },
      { name: 'deps', status: 'pending' },
      { name: 'migrate', status: 'pending' },
      { name: 'build', status: 'pending' },
      { name: 'start', status: 'pending' },
      { name: 'ssl', status: 'pending' }
    ];
  }

  private updateStage(name: string, status: DeployStage['status'], message?: string): void {
    const stage = this.stages.find(s => s.name === name);
    if (stage) {
      stage.status = status;
      stage.message = message;

      const icon = status === 'success' ? '✓' : status === 'failed' ? '✗' : status === 'running' ? '⏳' : '○';
      Logger.info(`[${icon}] ${name} ${message || ''}`);
    }
  }

  private printSummary(): void {
    Logger.info('\n=== Deploy Summary ===');
    for (const stage of this.stages) {
      const icon = stage.status === 'success' ? '✓' : stage.status === 'failed' ? '✗' : '○';
      console.log(`  ${icon} ${stage.name}: ${stage.status}`);
    }
  }

  /**
   * Install dependencies
   */
  private async installDependencies(
    projectPath: string,
    info: ProjectInfo
  ): Promise<boolean> {
    let cmd: string;

    switch (info.packageManager) {
      case 'npm':
        cmd = 'npm install';
        break;
      case 'yarn':
        cmd = 'yarn install';
        break;
      case 'pnpm':
        cmd = 'pnpm install';
        break;
      case 'pip':
        cmd = 'pip install -r requirements.txt';
        break;
      case 'go mod':
        cmd = 'go mod download';
        break;
      case 'cargo':
        cmd = 'cargo fetch';
        break;
      default:
        Logger.warning('Unknown package manager, skipping dependency installation');
        return true;
    }

    Logger.info(`Installing dependencies: ${cmd}`);
    const log = await this.executor.execute(`cd "${projectPath}" && ${cmd}`);

    if (log.exitCode !== 0) {
      Logger.error(`Dependency installation failed: ${log.error || log.output}`);
      return false;
    }

    return true;
  }

  /**
   * Build project (supports auto fix)
   */
  private async buildProject(
    projectPath: string,
    info: ProjectInfo,
    autoFix: boolean,
    requireConfirm: boolean
  ): Promise<boolean> {
    const buildCmd = info.scripts['build']
      ? `cd "${projectPath}" && npm run build`
      : null;

    if (!buildCmd) {
      Logger.info('No build script, skipping');
      return true;
    }

    Logger.info('Building project...');
    let log = await this.executor.execute(buildCmd);

    // Build failed, try auto fix
    if (log.exitCode !== 0 && autoFix) {
      Logger.warning('Build failed, attempting AI analysis and fix...');

      const changes = await this.codeMod.analyzeAndSuggestFix({
        error: log.output + (log.error || ''),
        context: 'Project build failed'
      }, projectPath);

      if (changes.length > 0) {
        for (const change of changes) {
          this.codeMod.showChangePreview(change);

          let shouldApply = !requireConfirm;
          if (requireConfirm) {
            const { confirm } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirm',
              message: 'Apply this change?',
              default: true
            }]);
            shouldApply = confirm;
          }

          if (shouldApply) {
            this.codeMod.applyChange(change);
          }
        }

        // Rebuild
        log = await this.executor.execute(buildCmd);
      }
    }

    return log.exitCode === 0;
  }

  /**
   * Start project
   */
  private async startProject(
    projectPath: string,
    info: ProjectInfo
  ): Promise<boolean> {
    let startCmd: string | null = null;

    if (info.scripts['start']) {
      startCmd = 'npm start';
    } else if (info.scripts['serve']) {
      startCmd = 'npm run serve';
    } else if (info.type === 'python') {
      startCmd = 'python app.py || python main.py';
    }

    if (!startCmd) {
      Logger.warning('No start command found');
      return true;
    }

    Logger.info(`Starting: ${startCmd}`);

    // Start in background
    const cmd = `cd "${projectPath}" && nohup ${startCmd} > app.log 2>&1 &`;
    const log = await this.executor.execute(cmd);

    return log.exitCode === 0;
  }
}
