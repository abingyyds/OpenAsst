import Anthropic from '@anthropic-ai/sdk';
import { Config, ExecutionLog } from '../types';
import { CommandExecutor } from './executor';
import { ProjectAnalyzer, ProjectInfo } from './project-analyzer';
import { ConfigManager } from './config-manager';
import { ErrorHandler } from './error-handler';
import { Logger } from '../utils/logger';

export interface InteractiveContext {
  projectInfo?: ProjectInfo;
  workingDir: string;
  history: ConversationTurn[];
  executedCommands: ExecutionLog[];
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  actions?: ActionResult[];
}

export interface ActionResult {
  type: 'command' | 'config' | 'file' | 'info';
  description: string;
  success: boolean;
  output?: string;
}

export class InteractiveEngine {
  private client: Anthropic;
  private model: string;
  private executor: CommandExecutor;
  private analyzer: ProjectAnalyzer;
  private configMgr: ConfigManager;
  private errorHandler: ErrorHandler;
  private context: InteractiveContext;
  private systemInfo: string = '';

  constructor(private config: Config, workingDir: string = process.cwd()) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.executor = new CommandExecutor();
    this.analyzer = new ProjectAnalyzer();
    this.configMgr = new ConfigManager(config);
    this.errorHandler = new ErrorHandler(config);
    this.context = {
      workingDir,
      history: [],
      executedCommands: []
    };
  }

  /**
   * Initialize - analyze project and get system info
   */
  async initialize(): Promise<void> {
    // Get system info
    const sysLog = await this.executor.execute('uname -a');
    this.systemInfo = sysLog.output;

    // Try to analyze current directory project
    try {
      this.context.projectInfo = await this.analyzer.analyze(this.context.workingDir);
      Logger.info(`Detected project: ${this.context.projectInfo.name}`);
      Logger.info(`Type: ${this.context.projectInfo.type} (${this.context.projectInfo.language})`);
      if (this.context.projectInfo.framework) {
        Logger.info(`Framework: ${this.context.projectInfo.framework}`);
      }
    } catch (e) {
      Logger.warning('No project structure detected');
    }
  }

  /**
   * Handle user input
   */
  async chat(userInput: string): Promise<string> {
    // Add to history
    this.context.history.push({ role: 'user', content: userInput });

    // Build prompt
    const prompt = this.buildPrompt(userInput);

    // Call AI
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('AI response format error');
    }

    // Parse and execute actions
    const result = await this.parseAndExecute(content.text);

    // Add to history
    this.context.history.push({
      role: 'assistant',
      content: result.response,
      actions: result.actions
    });

    return result.response;
  }

  private buildPrompt(userInput: string): string {
    const projectContext = this.context.projectInfo
      ? `
## Current Project Info
- Name: ${this.context.projectInfo.name}
- Type: ${this.context.projectInfo.type}
- Language: ${this.context.projectInfo.language}
- Framework: ${this.context.projectInfo.framework || 'None'}
- Package Manager: ${this.context.projectInfo.packageManager || 'None'}
- Available Scripts: ${Object.keys(this.context.projectInfo.scripts).join(', ') || 'None'}
- Environment Variables: ${this.context.projectInfo.envVars.join(', ') || 'None'}
`
      : '## No project detected';

    const historyContext = this.context.history.slice(-6).map(t =>
      `${t.role === 'user' ? 'User' : 'AI'}: ${t.content.substring(0, 200)}`
    ).join('\n');

    return `You are an intelligent project deployment assistant. Execute operations based on user needs.

## System Info
${this.systemInfo}

${projectContext}

## Working Directory
${this.context.workingDir}

## Conversation History
${historyContext}

## User Request
${userInput}

## Available Actions

1. **Execute Command**: Run shell commands on the server
2. **Modify Config**: Modify project config files
3. **Create File**: Create new files
4. **Analyze Project**: Analyze project structure

Please return your response in JSON format:
{
  "thinking": "Your analysis",
  "actions": [
    {
      "type": "command",
      "command": "command to execute",
      "description": "command description"
    },
    {
      "type": "config",
      "file": "config file path",
      "key": "config key",
      "value": "new value",
      "description": "change description"
    },
    {
      "type": "file",
      "path": "file path",
      "content": "file content",
      "description": "file description"
    }
  ],
  "response": "response to user"
}

Important rules:
- Commands must be safe to execute
- Verify file exists before modifying config
- Provide clear operation descriptions`;
  }

  private async parseAndExecute(
    text: string
  ): Promise<{ response: string; actions: ActionResult[] }> {
    const actions: ActionResult[] = [];
    let response = text;

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { response: text, actions: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      response = parsed.response || text;

      // Execute actions
      for (const action of parsed.actions || []) {
        const result = await this.executeAction(action);
        actions.push(result);
      }
    } catch (e) {
      // Parse failed, return original text
    }

    return { response, actions };
  }

  private async executeAction(action: any): Promise<ActionResult> {
    switch (action.type) {
      case 'command':
        return this.executeCommand(action);
      case 'config':
        return this.executeConfigChange(action);
      case 'file':
        return this.executeFileCreate(action);
      default:
        return {
          type: 'info',
          description: action.description || 'Unknown operation',
          success: false
        };
    }
  }

  private async executeCommand(action: any): Promise<ActionResult> {
    Logger.command(action.command);
    const log = await this.executor.execute(action.command);
    this.context.executedCommands.push(log);

    const success = log.exitCode === 0;
    if (success) {
      Logger.success('Execution successful');
      if (log.output) Logger.output(log.output.substring(0, 300));
    } else {
      Logger.error(`Execution failed: ${log.error || log.output}`);
    }

    return {
      type: 'command',
      description: action.description,
      success,
      output: log.output
    };
  }

  private async executeConfigChange(action: any): Promise<ActionResult> {
    try {
      const change = this.configMgr.updateConfig(
        action.file,
        action.key,
        action.value
      );
      Logger.success(`Config updated: ${change.description}`);
      return {
        type: 'config',
        description: change.description,
        success: true
      };
    } catch (e) {
      Logger.error(`Config update failed: ${(e as Error).message}`);
      return {
        type: 'config',
        description: action.description,
        success: false,
        output: (e as Error).message
      };
    }
  }

  private async executeFileCreate(action: any): Promise<ActionResult> {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(action.path);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(action.path, action.content);
      Logger.success(`File created: ${action.path}`);

      return {
        type: 'file',
        description: action.description,
        success: true
      };
    } catch (e) {
      Logger.error(`File creation failed: ${(e as Error).message}`);
      return {
        type: 'file',
        description: action.description,
        success: false,
        output: (e as Error).message
      };
    }
  }
}
