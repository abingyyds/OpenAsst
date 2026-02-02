import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { SmartTaskEngine, SmartTaskResult } from '../core/smart-task-engine';
import { ResultPresenter, NextStep } from '../core/result-presenter';
import { Marketplace } from '../core/marketplace';
import { DeviceManager } from '../core/device-manager';
import { WSHub } from '../core/ws-hub';
import chalk from 'chalk';

interface DoOptions {
  yes?: boolean;
  verbose?: boolean;
  dir?: string;
  // Cluster control options
  all?: boolean;
  tags?: string;
  devices?: string;
  group?: string;
}

export async function doCommand(task: string, options: DoOptions): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first to set up API key');
    return;
  }

  // Check if cluster control mode
  if (options.all || options.tags || options.devices || options.group) {
    await doClusterCommand(task, options);
    return;
  }

  try {
    const engine = new SmartTaskEngine(config);
    const presenter = new ResultPresenter();
    const marketplace = new Marketplace();

    Logger.info('\n========================================');
    Logger.info('  SMART TASK ENGINE');
    Logger.info('========================================\n');

  // Auto-fetch relevant scripts from API
  const relevantScripts = await marketplace.searchFromApi(task);
  let scriptContext = '';

  if (relevantScripts.length > 0) {
    Logger.info(`Found ${relevantScripts.length} relevant script(s):\n`);

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

  // Execute the task with script context (context is hidden from output)
  const result = await engine.executeTask(task, {
    autoConfirm: options.yes || false,
    workingDir: options.dir || process.cwd(),
    verbose: options.verbose !== false,
    context: scriptContext || undefined  // Pass as hidden context
  });

  // Show result
  showSmartResult(result);

  // Auto-learn from successful execution (silent, non-blocking)
  if (result.success && result.actionsExecuted > 0) {
    const commands = result.outputs.slice(0, 5);
    marketplace.learnFromExecution(
      task,
      commands,
      result.summary,
      true
    ).catch(() => {}); // Silently ignore errors
  }

  // Show suggestions
  if (result.suggestions.length > 0) {
    showSuggestions(result.suggestions);
  }

  // Offer follow-up actions
  await offerFollowUp(result, engine, options);

  } catch (error) {
    Logger.error(`Task execution failed: ${(error as Error).message}`);
    if (options.verbose) {
      console.error(error);
    }
  }
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
  const marketplace = new Marketplace();

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

    // Auto-learn from successful execution
    if (result.success && result.actionsExecuted > 0) {
      marketplace.learnFromExecution(
        task,
        result.outputs.slice(0, 5),
        result.summary,
        true
      ).catch(() => {});
    }

    if (result.suggestions.length > 0) {
      showSuggestions(result.suggestions);
    }

    console.log('');
  }
}

/**
 * Cluster control mode - execute task on multiple devices using AI
 */
async function doClusterCommand(task: string, options: DoOptions): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  const deviceManager = new DeviceManager();
  const engine = new SmartTaskEngine(config);

  // Determine target devices
  let targetDevices: any[] = [];

  if (options.all) {
    targetDevices = deviceManager.listDevices();
  } else if (options.tags) {
    const tags = options.tags.split(',').map(t => t.trim());
    targetDevices = deviceManager.getDevicesByTags(tags);
  } else if (options.devices) {
    const ids = options.devices.split(',').map(d => d.trim());
    targetDevices = deviceManager.getDevicesByIds(ids);
  } else if (options.group) {
    targetDevices = deviceManager.getDevicesByGroup(options.group);
  }

  if (targetDevices.length === 0) {
    Logger.error('No target devices found');
    return;
  }

  Logger.info('\n' + '='.repeat(50));
  Logger.info('  CLUSTER SMART TASK ENGINE');
  Logger.info('='.repeat(50));
  Logger.info(`\n  Task: ${task}`);
  Logger.info(`  Targets: ${targetDevices.length} device(s)`);
  Logger.info('='.repeat(50) + '\n');

  // Use AI to generate commands for the task
  Logger.info('Analyzing task with AI...\n');

  const planResult = await engine.planTask(task);

  if (!planResult.commands || planResult.commands.length === 0) {
    Logger.error('AI could not generate commands for this task');
    return;
  }

  Logger.info('Generated commands:');
  planResult.commands.forEach((cmd: string, i: number) => {
    console.log(chalk.cyan(`  ${i + 1}. ${cmd}`));
  });
  console.log('');

  // Confirm before execution
  if (!options.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Execute on ${targetDevices.length} device(s)?`,
      default: false
    }]);

    if (!confirm) {
      Logger.info('Cancelled');
      return;
    }
  }

  // Execute on all devices
  const hub = new WSHub();

  if (!hub.isRunning()) {
    Logger.info('Starting hub...');
    hub.start();
    await new Promise(r => setTimeout(r, 1000));
  }

  const onlineAgents = hub.getOnlineAgents();
  const onlineNames = onlineAgents.map(a => a.name);

  for (const cmd of planResult.commands) {
    Logger.info(`\nExecuting: ${cmd}`);

    const activeTargets = targetDevices
      .filter(d => onlineNames.includes(d.name))
      .map(d => d.name);

    if (activeTargets.length === 0) {
      Logger.warning('No online devices, skipping...');
      continue;
    }

    const results = await hub.broadcast(cmd, activeTargets, 60000);

    // Show results
    for (const result of results) {
      const icon = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${result.deviceName}: ${result.output.substring(0, 100).replace(/\n/g, ' ')}`);
    }
  }

  Logger.info('\n' + '='.repeat(50));
  Logger.success('Cluster task completed');
  Logger.info('='.repeat(50));
}
