import ora from 'ora';
import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { AIAssistant } from '../core/ai-assistant';
import { CommandExecutor } from '../core/executor';
import { ErrorHandler } from '../core/error-handler';
import { ResultPresenter, TaskResult } from '../core/result-presenter';

interface ExecutionHistory {
  iteration: number;
  reasoning: string;
  commands: string[];
  logs: any[];
  hasErrors: boolean;
}

export async function aiCommand(task: string): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first to set up API key');
    return;
  }

  const assistant = new AIAssistant(config);
  const executor = new CommandExecutor();
  const errorHandler = new ErrorHandler(config);
  const presenter = new ResultPresenter();

  const MAX_ITERATIONS = 10;
  const executionHistory: ExecutionHistory[] = [];
  const outputs: string[] = [];
  const errors: string[] = [];

  let currentIteration = 0;
  let taskCompleted = false;
  const startTime = Date.now();

  // Get system info
  const spinner = ora('Getting system info...').start();
  const sysInfoLog = await executor.execute(
    process.platform === 'win32'
      ? 'systeminfo | findstr /B /C:"OS Name"'
      : 'uname -a && cat /etc/os-release 2>/dev/null | head -5'
  );
  spinner.stop();

  Logger.info(`\nTask: ${task}\n`);

  while (currentIteration < MAX_ITERATIONS && !taskCompleted) {
    currentIteration++;
    Logger.info(`\n--- Round ${currentIteration} ---\n`);

    // Build history context
    let historyContext = '';
    if (executionHistory.length > 0) {
      historyContext = '\n\nExecution history:\n';
      executionHistory.forEach((h, i) => {
        historyContext += `\nRound ${i + 1}:\n`;
        historyContext += `Reasoning: ${h.reasoning}\n`;
        historyContext += `Commands: ${h.commands.join('; ')}\n`;
        historyContext += `Result: ${h.hasErrors ? 'FAILED' : 'SUCCESS'}\n`;
        if (h.hasErrors) {
          h.logs.filter(l => l.exitCode !== 0).forEach(log => {
            historyContext += `  Error: ${log.output.substring(0, 300)}\n`;
          });
        }
      });
    }

    spinner.text = 'AI analyzing task...';
    spinner.start();

    try {
      const plan = await assistant.planTaskWithSearch(task + historyContext, sysInfoLog.output);
      spinner.stop();

      Logger.info('AI Analysis:');
      console.log(plan.reasoning);
      console.log('');

      if (plan.commands.length === 0) {
        Logger.success('Task completed');
        taskCompleted = true;
        break;
      }

      Logger.info('Commands to execute:');
      plan.commands.forEach((cmd, i) => {
        console.log(`  ${i + 1}. ${cmd}`);
      });
      console.log('');

      // First round needs confirmation
      if (currentIteration === 1) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Execute these commands?',
          default: true
        }]);

        if (!confirm) {
          Logger.info('Cancelled');
          return;
        }
      }

      // Execute commands
      const logs = [];
      let hasErrors = false;

      for (const command of plan.commands) {
        Logger.command(command);
        const log = await executor.execute(command);
        logs.push(log);

        if (log.output) {
          outputs.push(log.output.substring(0, 200));
          Logger.output(log.output.substring(0, 500));
        }

        if (log.exitCode !== 0) {
          hasErrors = true;
          errors.push(`Command failed: ${command}`);
          Logger.error(`Failed (exit code: ${log.exitCode})`);

          // Auto error fix
          const quickFix = errorHandler.detectCommonError(log);
          if (quickFix && quickFix.confidence >= 80) {
            Logger.warning(`Detected: ${quickFix.analysis}`);
            Logger.info('Attempting auto fix...');
            for (const cmd of quickFix.fixCommands) {
              Logger.command(cmd);
              await executor.execute(cmd);
            }
          }
        } else {
          Logger.success('Success');
        }
        console.log('');
      }

      executionHistory.push({
        iteration: currentIteration,
        reasoning: plan.reasoning,
        commands: plan.commands,
        logs,
        hasErrors
      });

      if (!hasErrors) {
        taskCompleted = true;
      }

    } catch (error) {
      spinner.stop();
      errors.push((error as Error).message);
      Logger.error('AI Error: ' + (error as Error).message);
      break;
    }
  }

  // Show result
  const result: TaskResult = {
    success: taskCompleted,
    task,
    duration: Date.now() - startTime,
    stepsCompleted: executionHistory.filter(h => !h.hasErrors).length,
    totalSteps: executionHistory.length,
    outputs,
    errors
  };

  presenter.showResult(result);

  // Suggest next steps
  const taskType = detectTaskType(task);
  const nextSteps = presenter.suggestNextSteps(taskType, undefined, taskCompleted);
  presenter.showNextSteps(nextSteps);
}

function detectTaskType(task: string): string {
  const lower = task.toLowerCase();
  if (lower.includes('install')) return 'install';
  if (lower.includes('deploy')) return 'deploy';
  if (lower.includes('build')) return 'build';
  if (lower.includes('fix')) return 'fix';
  return 'general';
}