import ora from 'ora';
import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { DeployEngine } from '../core/deploy-engine';
import { DeploySource } from '../types';
import { ResultPresenter, TaskResult } from '../core/result-presenter';

export async function deployCommand(
  source: string,
  options: any
): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  const engine = new DeployEngine(config);
  const presenter = new ResultPresenter();
  const spinner = ora();
  const startTime = Date.now();

  const deploySource = parseSource(source, options.name);

  try {
    spinner.start('Fetching document...');
    spinner.text = 'AI analyzing and generating deploy plan...';
    const plan = await engine.generateDeployPlan(deploySource);
    spinner.stop();

    if (plan.steps.length === 0) {
      Logger.error('Could not generate deploy plan from document');
      return;
    }

    // Show plan
    Logger.info(`\nProject: ${plan.projectName}`);
    Logger.info(`Description: ${plan.description}\n`);

    Logger.info('Prerequisites:');
    plan.prerequisites.forEach(p => console.log(`  - ${p}`));

    Logger.info('\nDeploy steps:');
    plan.steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step.description}`);
      console.log(`     $ ${step.command}`);
    });

    if (plan.verifyCommand) {
      Logger.info(`\nVerify command: ${plan.verifyCommand}`);
    }

    console.log('');

    if (options.dryRun) {
      Logger.warning('Dry run mode - no commands executed');
      return;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Execute deployment?',
      default: true
    }]);

    if (!confirm) {
      Logger.info('Cancelled');
      return;
    }

    const result = await engine.executeDeploy(plan, {
      autoFix: options.autoFix !== false,
      maxRetries: options.retries || 3,
      dryRun: false
    });

    // Show result
    const taskResult: TaskResult = {
      success: result.success,
      task: `Deploy: ${plan.projectName}`,
      duration: Date.now() - startTime,
      stepsCompleted: result.stepsExecuted,
      totalSteps: result.totalSteps,
      outputs: [],
      errors: result.errors
    };

    presenter.showResult(taskResult);
    const nextSteps = presenter.suggestNextSteps('deploy', undefined, result.success);
    presenter.showNextSteps(nextSteps);

  } catch (error) {
    spinner.stop();
    Logger.error('Deploy failed: ' + (error as Error).message);
  }
}

function parseSource(source: string, name?: string): DeploySource {
  if (source.includes('github.com') || source.includes('raw.githubusercontent.com')) {
    return { type: 'github', content: source, name };
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { type: 'url', content: source, name };
  }
  if (source.includes('/') || source.includes('\\') || source.endsWith('.md')) {
    return { type: 'file', content: source, name };
  }
  return { type: 'text', content: source, name };
}

export async function deployTextCommand(): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  Logger.info('Enter document content (empty line to finish):');

  const lines: string[] = [];
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise<void>((resolve) => {
    rl.on('line', (line: string) => {
      if (line === '') {
        rl.close();
        resolve();
      } else {
        lines.push(line);
      }
    });
  });

  const content = lines.join('\n');
  if (!content.trim()) {
    Logger.error('No content entered');
    return;
  }

  await deployCommand(content, { name: 'Manual Input' });
}