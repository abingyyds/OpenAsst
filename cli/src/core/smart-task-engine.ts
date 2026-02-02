import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ExecutionLog } from '../types';
import { CommandExecutor } from './executor';
import { ErrorHandler } from './error-handler';
import { CodeModifier, CodeChange } from './code-modifier';
import { ProjectAnalyzer } from './project-analyzer';
import { SecurityGuard } from './security-guard';
import { Logger } from '../utils/logger';
import inquirer from 'inquirer';

// Action types the AI can perform
export type ActionType =
  | 'execute_command'
  | 'read_file'
  | 'write_file'
  | 'modify_file'
  | 'create_directory'
  | 'delete_file'
  | 'analyze_project'
  | 'install_package'
  | 'configure_service'
  | 'fix_code'
  | 'search_files'
  | 'verify_task'
  | 'ask_user'
  | 'complete';

export interface TaskAction {
  type: ActionType;
  description: string;
  params: Record<string, any>;
  requiresConfirmation?: boolean;
  critical?: boolean;
}

export interface TaskState {
  goal: string;
  currentStep: number;
  totalSteps: number;
  actions: TaskAction[];
  executedActions: { action: TaskAction; result: any; success: boolean }[];
  context: Record<string, any>;
  isComplete: boolean;
  errors: string[];
}

export interface SmartTaskResult {
  success: boolean;
  goal: string;
  summary: string;
  actionsExecuted: number;
  outputs: string[];
  errors: string[];
  suggestions: string[];
  duration: number;
}

export class SmartTaskEngine {
  private client: Anthropic;
  private model: string;
  private executor: CommandExecutor;
  private errorHandler: ErrorHandler;
  private codeModifier: CodeModifier;
  private projectAnalyzer: ProjectAnalyzer;
  private securityGuard: SecurityGuard;
  private systemInfo: string = '';
  private maxIterations: number = 20;

  constructor(private config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.executor = new CommandExecutor();
    this.errorHandler = new ErrorHandler(config);
    this.codeModifier = new CodeModifier(config);
    this.projectAnalyzer = new ProjectAnalyzer();
    this.securityGuard = new SecurityGuard();
  }

  /**
   * Execute a task with natural language understanding
   */
  async executeTask(userGoal: string, options: {
    autoConfirm?: boolean;
    workingDir?: string;
    verbose?: boolean;
    context?: string;  // Hidden context (e.g., knowledge base content) - not displayed but used by AI
  } = {}): Promise<SmartTaskResult> {
    const startTime = Date.now();
    const { autoConfirm = false, workingDir = process.cwd(), verbose = true, context = '' } = options;

    // Combine goal with hidden context for AI processing
    const fullGoal = context ? `${userGoal}\n\n${context}` : userGoal;

    // Initialize task state
    const state: TaskState = {
      goal: fullGoal,  // AI sees full context
      currentStep: 0,
      totalSteps: 0,
      actions: [],
      executedActions: [],
      context: {
        workingDir,
        platform: process.platform,
        homeDir: os.homedir(),
        user: os.userInfo().username
      },
      isComplete: false,
      errors: []
    };

    // Get system info
    await this.gatherSystemInfo(state);

    if (verbose) {
      Logger.info(`\nGoal: ${userGoal}\n`);
      Logger.info('Analyzing task and planning actions...\n');
    }

    let iteration = 0;
    const outputs: string[] = [];
    const suggestions: string[] = [];

    while (!state.isComplete && iteration < this.maxIterations) {
      iteration++;

      try {
        // Plan next actions based on current state
        const plan = await this.planNextActions(state);

        if (plan.isComplete) {
          state.isComplete = true;
          suggestions.push(...(plan.suggestions || []));
          break;
        }

        if (plan.actions.length === 0) {
          state.isComplete = true;
          break;
        }

        state.totalSteps = Math.max(state.totalSteps, state.currentStep + plan.actions.length);

        // Execute each action
        for (const action of plan.actions) {
          state.currentStep++;

          if (verbose) {
            Logger.info(`\n[Step ${state.currentStep}] ${action.description}`);
          }

          // Check if confirmation needed
          if (action.requiresConfirmation && !autoConfirm) {
            const confirmed = await this.confirmAction(action);
            if (!confirmed) {
              if (verbose) Logger.warning('Action skipped by user');
              continue;
            }
          }

          // Execute the action
          const result = await this.executeAction(action, state);

          state.executedActions.push({
            action,
            result: result.output,
            success: result.success
          });

          if (result.output) {
            outputs.push(result.output.substring(0, 500));
          }

          if (!result.success) {
            state.errors.push(result.error || 'Unknown error');

            if (verbose) {
              Logger.error(`Action failed: ${result.error}`);
            }

            // Try to auto-fix if possible
            if (action.type === 'execute_command') {
              const fixed = await this.tryAutoFix(action, result, state);
              if (!fixed && action.critical) {
                if (verbose) Logger.error('Critical action failed, stopping task');
                break;
              }
            }
          } else if (verbose) {
            Logger.success('Done');
          }
        }

      } catch (error) {
        state.errors.push((error as Error).message);
        if (verbose) Logger.error(`Error: ${(error as Error).message}`);
        break;
      }
    }

    // Generate final summary
    const summary = await this.generateSummary(state);

    return {
      success: state.errors.length === 0 && state.isComplete,
      goal: userGoal,
      summary,
      actionsExecuted: state.executedActions.length,
      outputs,
      errors: state.errors,
      suggestions,
      duration: Date.now() - startTime
    };
  }

  /**
   * Gather system information
   */
  private async gatherSystemInfo(state: TaskState): Promise<void> {
    const commands = [
      'uname -a 2>/dev/null || ver',
      'cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || echo "Unknown OS"',
      'which apt-get yum dnf brew pacman 2>/dev/null | head -1'
    ];

    const results: string[] = [];
    for (const cmd of commands) {
      const log = await this.executor.execute(cmd);
      if (log.exitCode === 0 && log.output) {
        results.push(log.output.trim());
      }
    }

    this.systemInfo = results.join('\n');
    state.context.systemInfo = this.systemInfo;

    // Detect package manager
    if (this.systemInfo.includes('apt-get')) {
      state.context.packageManager = 'apt';
    } else if (this.systemInfo.includes('yum')) {
      state.context.packageManager = 'yum';
    } else if (this.systemInfo.includes('dnf')) {
      state.context.packageManager = 'dnf';
    } else if (this.systemInfo.includes('brew')) {
      state.context.packageManager = 'brew';
    } else if (this.systemInfo.includes('pacman')) {
      state.context.packageManager = 'pacman';
    }
  }

  /**
   * Plan next actions using AI
   */
  private async planNextActions(state: TaskState): Promise<{
    actions: TaskAction[];
    isComplete: boolean;
    suggestions?: string[];
  }> {
    const prompt = this.buildPlanningPrompt(state);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { actions: [], isComplete: true };
    }

    return this.parsePlanResponse(content.text);
  }

  /**
   * Build the planning prompt
   */
  private buildPlanningPrompt(state: TaskState): string {
    const executionHistory = state.executedActions.map((ea, i) =>
      `${i + 1}. [${ea.success ? 'SUCCESS' : 'FAILED'}] ${ea.action.description}\n   Result: ${String(ea.result).substring(0, 300)}`
    ).join('\n');

    return `You are an intelligent system assistant that helps users accomplish tasks through natural language.

## User's Goal
${state.goal}

## System Information
Platform: ${state.context.platform}
Package Manager: ${state.context.packageManager || 'unknown'}
Working Directory: ${state.context.workingDir}
${this.systemInfo}

## Execution History
${executionHistory || 'No actions executed yet'}

## Errors Encountered
${state.errors.length > 0 ? state.errors.join('\n') : 'None'}

## Available Actions
You can perform these actions:
- execute_command: Run shell commands
- read_file: Read file contents
- write_file: Create or overwrite a file
- modify_file: Modify specific parts of a file
- create_directory: Create directories
- delete_file: Delete files (requires confirmation)
- analyze_project: Analyze project structure
- install_package: Install system packages
- configure_service: Configure system services
- fix_code: Analyze and fix code errors
- search_files: Search for files by pattern
- verify_task: Verify if task is complete
- ask_user: Ask user for input
- complete: Mark task as complete

## Instructions
1. Analyze the user's goal and current state
2. Determine what actions are needed next
3. If the goal is achieved, mark as complete
4. For dangerous operations (delete, system changes), set requiresConfirmation: true
5. For critical operations that must succeed, set critical: true

Return JSON:
{
  "reasoning": "Your analysis of current state and what needs to be done",
  "isComplete": false,
  "actions": [
    {
      "type": "execute_command",
      "description": "What this action does",
      "params": { "command": "the command" },
      "requiresConfirmation": false,
      "critical": false
    }
  ],
  "suggestions": ["Next steps after completion"]
}

Important:
- Break complex tasks into small, verifiable steps
- After each command, verify the result before proceeding
- If something fails, try alternative approaches
- Use the correct package manager for this system
- Always verify task completion before marking complete`;
  }

  /**
   * Parse the AI's plan response
   */
  private parsePlanResponse(text: string): {
    actions: TaskAction[];
    isComplete: boolean;
    suggestions?: string[];
  } {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          actions: parsed.actions || [],
          isComplete: parsed.isComplete || false,
          suggestions: parsed.suggestions
        };
      }
    } catch (e) {
      Logger.warning('Failed to parse AI response');
    }
    return { actions: [], isComplete: true };
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: TaskAction,
    state: TaskState
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    switch (action.type) {
      case 'execute_command':
        return this.executeCommand(action.params.command, state);

      case 'read_file':
        return this.readFile(action.params.path);

      case 'write_file':
        return this.writeFile(action.params.path, action.params.content);

      case 'modify_file':
        return this.modifyFile(action.params.path, action.params.search, action.params.replace);

      case 'create_directory':
        return this.createDirectory(action.params.path);

      case 'delete_file':
        return this.deleteFile(action.params.path);

      case 'analyze_project':
        return this.analyzeProject(action.params.path || state.context.workingDir);

      case 'install_package':
        return this.installPackage(action.params.package, state);

      case 'search_files':
        return this.searchFiles(action.params.pattern, action.params.path);

      case 'fix_code':
        return this.fixCode(action.params, state);

      case 'verify_task':
        return this.verifyTask(action.params.verification, state);

      case 'complete':
        state.isComplete = true;
        return { success: true, output: 'Task marked as complete' };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  }

  /**
   * Execute a shell command with security check
   */
  private async executeCommand(
    command: string,
    state: TaskState
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    // Security check
    const securityCheck = this.securityGuard.checkCommand(command);
    if (!securityCheck.safe) {
      Logger.error(`Security warning: ${securityCheck.reason}`);
      if (securityCheck.suggestion) {
        Logger.warning(`Suggestion: ${securityCheck.suggestion}`);
      }
      return {
        success: false,
        error: `Command blocked for security: ${securityCheck.reason}`
      };
    }

    if (securityCheck.risk === 'high' || securityCheck.risk === 'medium') {
      Logger.warning(`Security notice: ${securityCheck.reason}`);
    }

    Logger.command(command);
    const log = await this.executor.execute(command);

    if (log.output) {
      Logger.output(log.output.substring(0, 1000));
    }

    if (log.exitCode === 0) {
      return { success: true, output: log.output };
    } else {
      return {
        success: false,
        output: log.output,
        error: log.error || `Exit code: ${log.exitCode}`
      };
    }
  }

  /**
   * Read a file
   */
  private async readFile(filePath: string): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const fullPath = path.resolve(filePath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `File not found: ${fullPath}` };
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      return { success: true, output: content };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Write a file
   */
  private async writeFile(
    filePath: string,
    content: string
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const fullPath = path.resolve(filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content);
      return { success: true, output: `File written: ${fullPath}` };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Modify a file
   */
  private async modifyFile(
    filePath: string,
    search: string,
    replace: string
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const fullPath = path.resolve(filePath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `File not found: ${fullPath}` };
      }
      let content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(search)) {
        return { success: false, error: 'Search pattern not found in file' };
      }
      content = content.replace(search, replace);
      fs.writeFileSync(fullPath, content);
      return { success: true, output: `File modified: ${fullPath}` };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Create a directory
   */
  private async createDirectory(dirPath: string): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const fullPath = path.resolve(dirPath);
      fs.mkdirSync(fullPath, { recursive: true });
      return { success: true, output: `Directory created: ${fullPath}` };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Delete a file
   */
  private async deleteFile(filePath: string): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const fullPath = path.resolve(filePath);
      if (!fs.existsSync(fullPath)) {
        return { success: true, output: 'File does not exist' };
      }
      fs.unlinkSync(fullPath);
      return { success: true, output: `File deleted: ${fullPath}` };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Analyze a project
   */
  private async analyzeProject(projectPath: string): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const info = await this.projectAnalyzer.analyze(projectPath);
      return {
        success: true,
        output: JSON.stringify(info, null, 2)
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Install a package using the system package manager
   */
  private async installPackage(
    packageName: string,
    state: TaskState
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const pm = state.context.packageManager;
    let command: string;

    switch (pm) {
      case 'apt':
        command = `sudo apt-get install -y ${packageName}`;
        break;
      case 'yum':
        command = `sudo yum install -y ${packageName}`;
        break;
      case 'dnf':
        command = `sudo dnf install -y ${packageName}`;
        break;
      case 'brew':
        command = `brew install ${packageName}`;
        break;
      case 'pacman':
        command = `sudo pacman -S --noconfirm ${packageName}`;
        break;
      default:
        return { success: false, error: 'Unknown package manager' };
    }

    return this.executeCommand(command, state);
  }

  /**
   * Search for files
   */
  private async searchFiles(
    pattern: string,
    searchPath?: string
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const basePath = searchPath || process.cwd();
    const command = `find ${basePath} -name "${pattern}" 2>/dev/null | head -20`;
    const log = await this.executor.execute(command);
    return {
      success: log.exitCode === 0,
      output: log.output,
      error: log.error
    };
  }

  /**
   * Fix code using AI
   */
  private async fixCode(
    params: Record<string, any>,
    state: TaskState
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const changes = await this.codeModifier.analyzeAndSuggestFix(
        {
          error: params.error,
          file: params.file,
          context: params.context,
          stackTrace: params.stackTrace
        },
        state.context.workingDir
      );

      if (changes.length === 0) {
        return { success: false, error: 'No fix suggestions found' };
      }

      // Show changes and apply with confirmation
      for (const change of changes) {
        this.codeModifier.showChangePreview(change);
        const applied = this.codeModifier.applyChange(change);
        if (!applied) {
          return { success: false, error: 'Failed to apply code change' };
        }
      }

      return { success: true, output: `Applied ${changes.length} code changes` };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Verify if task is complete
   */
  private async verifyTask(
    verification: string,
    state: TaskState
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    // Execute verification command or check
    const log = await this.executor.execute(verification);
    return {
      success: log.exitCode === 0,
      output: log.output,
      error: log.error
    };
  }

  /**
   * Confirm action with user
   */
  private async confirmAction(action: TaskAction): Promise<boolean> {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Execute: ${action.description}?`,
      default: true
    }]);
    return confirm;
  }

  /**
   * Try to auto-fix a failed action
   */
  private async tryAutoFix(
    action: TaskAction,
    result: { success: boolean; output?: string; error?: string },
    state: TaskState
  ): Promise<boolean> {
    if (action.type !== 'execute_command') return false;

    const log: ExecutionLog = {
      timestamp: new Date(),
      command: action.params.command,
      output: result.output || '',
      exitCode: 1,
      error: result.error
    };

    // Try quick fix first
    const quickFix = this.errorHandler.detectCommonError(log);
    if (quickFix && quickFix.confidence >= 80) {
      Logger.warning(`Detected: ${quickFix.analysis}`);
      Logger.info('Attempting auto-fix...');

      for (const cmd of quickFix.fixCommands) {
        Logger.command(cmd);
        const fixLog = await this.executor.execute(cmd);
        if (fixLog.exitCode !== 0) {
          return false;
        }
      }

      // Retry original command
      const retryLog = await this.executor.execute(action.params.command);
      if (retryLog.exitCode === 0) {
        Logger.success('Auto-fix successful');
        return true;
      }
    }

    return false;
  }

  /**
   * Plan a task and return commands without executing
   * Used for cluster control to generate commands for multiple devices
   */
  async planTask(userGoal: string): Promise<{ commands: string[]; description: string }> {
    const prompt = `You are an intelligent system assistant. The user wants to execute a task on multiple remote Linux servers.

## User's Goal
${userGoal}

## Instructions
1. Analyze the user's goal
2. Generate a list of shell commands that will accomplish this task
3. Commands should be suitable for execution on remote Linux servers
4. Use common package managers (apt, yum, dnf) with auto-confirm flags (-y)
5. Keep commands simple and atomic

Return JSON:
{
  "description": "Brief description of what these commands will do",
  "commands": [
    "command1",
    "command2"
  ]
}

Important:
- Only return shell commands, no explanations in the commands array
- Use sudo where needed for system operations
- Prefer apt-get for Debian/Ubuntu, but commands should be adaptable
- Each command should be independent and executable`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { commands: [], description: 'Failed to generate commands' };
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          commands: parsed.commands || [],
          description: parsed.description || ''
        };
      }
    } catch (e) {
      Logger.error(`Failed to plan task: ${(e as Error).message}`);
    }

    return { commands: [], description: 'Failed to generate commands' };
  }

  /**
   * Generate a summary of the task execution
   */
  private async generateSummary(state: TaskState): Promise<string> {
    const successCount = state.executedActions.filter(a => a.success).length;
    const failCount = state.executedActions.filter(a => !a.success).length;

    let summary = `Executed ${state.executedActions.length} actions`;
    summary += ` (${successCount} succeeded, ${failCount} failed)`;

    if (state.isComplete && state.errors.length === 0) {
      summary += '. Task completed successfully.';
    } else if (state.errors.length > 0) {
      summary += `. Encountered ${state.errors.length} error(s).`;
    }

    return summary;
  }
}
