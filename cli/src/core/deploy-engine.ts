import Anthropic from '@anthropic-ai/sdk';
import { Config, DeploySource, DeployPlan, DeployStep, DeployResult, ExecutionLog } from '../types';
import { DocumentParser, ParsedDocument } from './document-parser';
import { ErrorHandler } from './error-handler';
import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';

export interface DeployOptions {
  autoFix?: boolean;        // Auto fix errors
  maxRetries?: number;      // Max retry count
  confirmEachStep?: boolean; // Confirm each step
  dryRun?: boolean;         // Only show plan, don't execute
}

export class DeployEngine {
  private client: Anthropic;
  private model: string;
  private parser: DocumentParser;
  private errorHandler: ErrorHandler;
  private executor: CommandExecutor;
  private systemInfo: string = '';

  constructor(private config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.parser = new DocumentParser();
    this.errorHandler = new ErrorHandler(config);
    this.executor = new CommandExecutor();
  }

  /**
   * Get system info
   */
  async getSystemInfo(): Promise<string> {
    if (this.systemInfo) return this.systemInfo;

    const commands = [
      'uname -a',
      'cat /etc/os-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null || echo "Unknown OS"',
      'which apt-get yum dnf brew 2>/dev/null | head -1'
    ];

    const results: string[] = [];
    for (const cmd of commands) {
      const log = await this.executor.execute(cmd);
      if (log.exitCode === 0) {
        results.push(log.output.trim());
      }
    }

    this.systemInfo = results.join('\n');
    return this.systemInfo;
  }

  /**
   * Generate deploy plan from document source
   */
  async generateDeployPlan(source: DeploySource): Promise<DeployPlan> {
    // Get document content
    const content = await this.parser.fetchDocument(source);
    const parsed = this.parser.parseDocument(content);

    // Get system info
    const sysInfo = await this.getSystemInfo();

    // Use AI to generate deploy plan
    const plan = await this.aiGenerateDeployPlan(parsed, sysInfo, source.name);

    return plan;
  }

  /**
   * AI generate deploy plan
   */
  private async aiGenerateDeployPlan(
    doc: ParsedDocument,
    systemInfo: string,
    projectName?: string
  ): Promise<DeployPlan> {
    const prompt = `You are a professional DevOps engineer. Please generate a complete deployment plan based on the following document content.

## Document Title
${doc.title}

## Document Content
${doc.content.substring(0, 8000)}

## Extracted Code Blocks
${doc.codeBlocks.map((b, i) => `### Code Block ${i + 1} (${b.language})
Context: ${b.context}
\`\`\`
${b.code}
\`\`\`
`).join('\n')}

## Target System Info
${systemInfo}

## Requirements

Please generate a structured deployment plan including:
1. Project name and description
2. Prerequisites check (software that needs to be pre-installed)
3. Detailed deployment steps (one command per step)
4. Verification command (check if deployment succeeded)
5. Rollback commands (if deployment fails)

Please return in JSON format:
{
  "projectName": "${projectName || 'Project Name'}",
  "description": "Project description",
  "prerequisites": ["git", "node", "npm"],
  "steps": [
    {
      "description": "Step description",
      "command": "command to execute",
      "optional": false,
      "retryCount": 3,
      "timeout": 300
    }
  ],
  "verifyCommand": "command to verify deployment success",
  "rollbackCommands": ["rollback command 1", "rollback command 2"]
}

**Important rules**:
- Commands must be complete and directly executable
- Consider target system package manager (apt/yum/dnf)
- Include necessary sudo permissions
- Steps should be in correct order
- Each step should contain only one command`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('AI response format error');
    }

    return this.parseDeployPlan(content.text, projectName);
  }

  private parseDeployPlan(text: string, fallbackName?: string): DeployPlan {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        return {
          projectName: plan.projectName || fallbackName || 'Unnamed Project',
          description: plan.description || '',
          prerequisites: plan.prerequisites || [],
          steps: (plan.steps || []).map((s: any) => ({
            description: s.description || '',
            command: s.command || '',
            optional: s.optional || false,
            retryCount: s.retryCount || 3,
            timeout: s.timeout || 300
          })),
          verifyCommand: plan.verifyCommand,
          rollbackCommands: plan.rollbackCommands || []
        };
      }
    } catch (e) {
      // Parse failed
    }

    return {
      projectName: fallbackName || 'Unnamed Project',
      description: 'Unable to parse deploy plan',
      prerequisites: [],
      steps: [],
      rollbackCommands: []
    };
  }

  /**
   * Execute deploy plan
   */
  async executeDeploy(
    plan: DeployPlan,
    options: DeployOptions = {}
  ): Promise<DeployResult> {
    const {
      autoFix = true,
      maxRetries = 3,
      dryRun = false
    } = options;

    const startTime = Date.now();
    const logs: ExecutionLog[] = [];
    const errors: string[] = [];
    let stepsExecuted = 0;

    Logger.info(`\nStarting deployment: ${plan.projectName}`);
    Logger.info(`Description: ${plan.description}\n`);

    if (dryRun) {
      Logger.warning('[ Dry run mode - no actual commands will be executed ]\n');
      this.printPlan(plan);
      return {
        success: true,
        projectName: plan.projectName,
        stepsExecuted: 0,
        totalSteps: plan.steps.length,
        logs: [],
        errors: [],
        duration: 0
      };
    }

    // Check prerequisites
    const prereqOk = await this.checkPrerequisites(plan.prerequisites);
    if (!prereqOk) {
      return {
        success: false,
        projectName: plan.projectName,
        stepsExecuted: 0,
        totalSteps: plan.steps.length,
        logs,
        errors: ['Prerequisites check failed'],
        duration: Date.now() - startTime
      };
    }

    // Execute each step
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const stepNum = i + 1;

      Logger.info(`\n[${stepNum}/${plan.steps.length}] ${step.description}`);
      Logger.command(step.command);

      let success = false;
      let retries = 0;

      while (!success && retries <= maxRetries) {
        const log = await this.executor.execute(step.command);
        logs.push(log);

        if (log.exitCode === 0) {
          success = true;
          stepsExecuted++;
          Logger.success('Execution successful');
          if (log.output) {
            Logger.output(log.output.substring(0, 500));
          }
        } else {
          retries++;
          Logger.error(`Execution failed (exit code: ${log.exitCode})`);

          if (autoFix && retries <= maxRetries) {
            Logger.warning(`Attempting auto fix (${retries}/${maxRetries})...`);
            const fixed = await this.tryAutoFix(log, step);
            if (fixed) {
              success = true;
              stepsExecuted++;
            }
          }
        }
      }

      if (!success) {
        errors.push(`Step ${stepNum} failed: ${step.description}`);
        if (!step.optional) {
          Logger.error('Critical step failed, stopping deployment');
          break;
        }
      }
    }

    // Verify deployment
    let deploySuccess = errors.length === 0;
    if (deploySuccess && plan.verifyCommand) {
      Logger.info('\nVerifying deployment...');
      const verifyLog = await this.executor.execute(plan.verifyCommand);
      if (verifyLog.exitCode !== 0) {
        deploySuccess = false;
        errors.push('Deployment verification failed');
      } else {
        Logger.success('Deployment verification passed');
      }
    }

    const duration = Date.now() - startTime;

    if (deploySuccess) {
      Logger.success(`\nDeployment successful! Duration: ${(duration / 1000).toFixed(1)}s`);
    } else {
      Logger.error(`\nDeployment failed! Duration: ${(duration / 1000).toFixed(1)}s`);
    }

    return {
      success: deploySuccess,
      projectName: plan.projectName,
      stepsExecuted,
      totalSteps: plan.steps.length,
      logs,
      errors,
      duration
    };
  }

  private printPlan(plan: DeployPlan): void {
    Logger.info('Prerequisites:');
    plan.prerequisites.forEach(p => console.log(`  - ${p}`));
    Logger.info('\nDeploy steps:');
    plan.steps.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.description}`);
      console.log(`     $ ${s.command}`);
    });
  }

  private async checkPrerequisites(prerequisites: string[]): Promise<boolean> {
    Logger.info('Checking prerequisites...');
    for (const prereq of prerequisites) {
      const log = await this.executor.execute(`which ${prereq}`);
      if (log.exitCode !== 0) {
        Logger.warning(`Missing: ${prereq}`);
        return false;
      }
      Logger.success(`Installed: ${prereq}`);
    }
    return true;
  }

  private async tryAutoFix(log: ExecutionLog, step: DeployStep): Promise<boolean> {
    // Try quick fix first
    const quickFix = this.errorHandler.detectCommonError(log);
    if (quickFix && quickFix.confidence >= 80) {
      Logger.info(`Detected common error: ${quickFix.analysis}`);
      for (const cmd of quickFix.fixCommands) {
        Logger.command(cmd);
        const fixLog = await this.executor.execute(cmd);
        if (fixLog.exitCode !== 0) {
          return false;
        }
      }
      // Retry original command
      const retryLog = await this.executor.execute(step.command);
      return retryLog.exitCode === 0;
    }

    // AI analysis fix
    const sysInfo = await this.getSystemInfo();
    const solution = await this.errorHandler.analyzeError({
      command: log.command,
      output: log.output + (log.error || ''),
      exitCode: log.exitCode,
      systemInfo: sysInfo,
      previousCommands: []
    });

    if (solution.confidence >= 70 && solution.fixCommands.length > 0) {
      Logger.info(`AI analysis: ${solution.analysis}`);
      for (const cmd of solution.fixCommands) {
        Logger.command(cmd);
        await this.executor.execute(cmd);
      }
      const retryLog = await this.executor.execute(step.command);
      return retryLog.exitCode === 0;
    }

    return false;
  }
}
