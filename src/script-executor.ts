import { ConnectionManager } from './connection-manager';
import { ClaudeAssistant } from './claude-assistant';
import { CommandScript, ExecutionLog, ServerConfig } from './types';

export interface ExecutionResult {
  success: boolean;
  logs: ExecutionLog[];
  aiSuggestions?: string[];
}

export class ScriptExecutor {
  constructor(
    private connectionManager: ConnectionManager,
    private claudeAssistant: ClaudeAssistant
  ) {}

  async executeScript(script: CommandScript, serverConfig: ServerConfig): Promise<ExecutionResult> {
    const logs: ExecutionLog[] = [];
    const aiSuggestions: string[] = [];

    const executor = await this.connectionManager.getExecutor(serverConfig);

    for (let i = 0; i < script.commands.length; i++) {
      const command = script.commands[i];

      try {
        const log = await executor.execute(command);
        logs.push(log);

        if (log.exitCode !== 0) {
          const previousCommands = script.commands.slice(0, i + 1);
          const solution = await this.claudeAssistant.getSolution({
            error: log.error || log.output,
            context: `Executing script: ${script.name}`,
            previousCommands,
          });

          aiSuggestions.push(solution);

          return {
            success: false,
            logs,
            aiSuggestions,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logs.push({
          timestamp: new Date(),
          command,
          output: '',
          exitCode: -1,
          error: errorMessage,
        });

        const previousCommands = script.commands.slice(0, i + 1);
        const solution = await this.claudeAssistant.getSolution({
          error: errorMessage,
          context: `Executing script: ${script.name}`,
          previousCommands,
        });

        aiSuggestions.push(solution);

        return {
          success: false,
          logs,
          aiSuggestions,
        };
      }
    }

    return {
      success: true,
      logs,
    };
  }
}
