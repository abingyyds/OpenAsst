import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { SmartTaskEngine, SmartTaskResult } from '../core/smart-task-engine';
import { ResultPresenter, NextStep } from '../core/result-presenter';
import { Marketplace } from '../core/marketplace';

interface DoOptions {
  yes?: boolean;
  verbose?: boolean;
  dir?: string;
}

export async function doCommand(task: string, options: DoOptions): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first to set up API key');
    return;
  }

  const engine = new SmartTaskEngine(config);
  const presenter = new ResultPresenter();
  const marketplace = new Marketplace();

  Logger.info('\n========================================');
  Logger.info('  SMART TASK ENGINE');
  Logger.info('========================================\n');

  // Check marketplace for relevant scripts
  const relevantScripts = marketplace.search(task);
  let scriptContext = '';

  if (relevantScripts.length > 0) {
    Logger.info(`Found ${relevantScripts.length} relevant script(s) in marketplace:\n`);

    relevantScripts.forEach((script, i) => {
      Logger.info(`  [${i + 1}] ${script.name}: ${script.description}`);
    });
    console.log('');

    // Use the first matching script's content as context
    const bestMatch = relevantScripts[0];
    if (bestMatch.documentContent) {
      scriptContext = `\n\nReference documentation from marketplace script "${bestMatch.name}":\n${bestMatch.documentContent}`;
      Logger.info(`Using script: ${bestMatch.name}\n`);
    } else if (bestMatch.commands && bestMatch.commands.length > 0) {
      scriptContext = `\n\nReference commands from marketplace script "${bestMatch.name}":\n${bestMatch.commands.join('\n')}`;
      Logger.info(`Using script: ${bestMatch.name}\n`);
    }
  }

  // Execute the task with script context
  const taskWithContext = scriptContext ? `${task}${scriptContext}` : task;

  const result = await engine.executeTask(taskWithContext, {
    autoConfirm: options.yes || false,
    workingDir: options.dir || process.cwd(),
    verbose: options.verbose !== false
  });

  // Show result
  showSmartResult(result);

  // Show suggestions
  if (result.suggestions.length > 0) {
    showSuggestions(result.suggestions);
  }

  // Offer follow-up actions
  await offerFollowUp(result, engine, options);
}

function showSmartResult(result: SmartTaskResult): void {
  console.log('\n' + '='.repeat(50));
  console.log('  TASK RESULT');
  console.log('='.repeat(50));

  const status = result.success ? '✓ SUCCESS' : '✗ FAILED';
  const statusColor = result.success ? '\x1b[32m' : '\x1b[31m';

  console.log(`\n  Status: ${statusColor}${status}\x1b[0m`);
  console.log(`  Goal: ${result.goal}`);
  console.log(`  Summary: ${result.summary}`);
  console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`  Actions: ${result.actionsExecuted}`);

  if (result.outputs.length > 0) {
    console.log('\n  Key Outputs:');
    result.outputs.slice(-3).forEach(o => {
      const truncated = o.substring(0, 100).replace(/\n/g, ' ');
      console.log(`    • ${truncated}`);
    });
  }

  if (result.errors.length > 0) {
    console.log('\n  Errors:');
    result.errors.forEach(e => {
      console.log(`    \x1b[31m• ${e}\x1b[0m`);
    });
  }

  console.log('\n' + '='.repeat(50));
}

function showSuggestions(suggestions: string[]): void {
  console.log('\n  SUGGESTED NEXT STEPS:');
  console.log('  ' + '-'.repeat(46));

  suggestions.forEach((suggestion, i) => {
    console.log(`\n  ${i + 1}. ${suggestion}`);
  });

  console.log('\n');
}

async function offerFollowUp(
  result: SmartTaskResult,
  engine: SmartTaskEngine,
  options: DoOptions
): Promise<void> {
  if (result.success) return;

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'Task encountered issues. What would you like to do?',
    choices: [
      { name: 'Let AI try to fix the issues', value: 'fix' },
      { name: 'Retry the task', value: 'retry' },
      { name: 'Exit', value: 'exit' }
    ]
  }]);

  if (action === 'fix') {
    const fixTask = `Fix the following errors from previous task "${result.goal}": ${result.errors.join('; ')}`;
    const fixResult = await engine.executeTask(fixTask, {
      autoConfirm: options.yes || false,
      workingDir: options.dir || process.cwd(),
      verbose: options.verbose !== false
    });
    showSmartResult(fixResult);
  } else if (action === 'retry') {
    const retryResult = await engine.executeTask(result.goal, {
      autoConfirm: options.yes || false,
      workingDir: options.dir || process.cwd(),
      verbose: options.verbose !== false
    });
    showSmartResult(retryResult);
  }
}

/**
 * Interactive mode - continuous task execution
 */
export async function doInteractiveCommand(): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first to set up API key');
    return;
  }

  const engine = new SmartTaskEngine(config);

  Logger.info('\n========================================');
  Logger.info('  INTERACTIVE SMART ASSISTANT');
  Logger.info('========================================');
  Logger.info('\nDescribe what you want to do in natural language.');
  Logger.info('Type "exit" or "quit" to leave.\n');

  while (true) {
    const { task } = await inquirer.prompt([{
      type: 'input',
      name: 'task',
      message: 'What do you want to do?',
      validate: (input: string) => input.length > 0 || 'Please enter a task'
    }]);

    if (['exit', 'quit', 'q'].includes(task.toLowerCase())) {
      Logger.info('Goodbye!');
      break;
    }

    const result = await engine.executeTask(task, {
      autoConfirm: false,
      verbose: true
    });

    showSmartResult(result);

    if (result.suggestions.length > 0) {
      showSuggestions(result.suggestions);
    }

    console.log('');
  }
}
