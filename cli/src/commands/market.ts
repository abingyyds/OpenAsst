import inquirer from 'inquirer';
import { Logger } from '../utils/logger';
import { Marketplace } from '../core/marketplace';
import { CommandExecutor } from '../core/executor';
import { AIAssistant } from '../core/ai-assistant';
import { ConfigManager } from '../utils/config';

const marketplace = new Marketplace();
const executor = new CommandExecutor();

export async function marketSyncCommand(): Promise<void> {
  Logger.info(`Syncing from ${marketplace.getApiUrl()}...`);

  const result = await marketplace.sync();

  if (result.success) {
    Logger.success(result.message);
  } else {
    Logger.error(result.message);
  }
}

export async function marketListCommand(): Promise<void> {
  const scripts = marketplace.getAll();

  if (scripts.length === 0) {
    Logger.warning('Marketplace is empty');
    return;
  }

  Logger.info(`Total ${scripts.length} scripts:\n`);

  scripts.forEach(script => {
    console.log(`  ${script.id}`);
    console.log(`    Name: ${script.name}`);
    console.log(`    Description: ${script.description}`);
    if (script.documentContent) {
      console.log(`    Type: ${script.documentType === 'markdown' ? 'Markdown' : 'Text'}`);
    }
    if (script.tags && script.tags.length > 0) {
      console.log(`    Tags: ${script.tags.join(', ')}`);
    }
    console.log('');
  });
}

export async function marketSearchCommand(keyword: string): Promise<void> {
  const scripts = marketplace.search(keyword);

  if (scripts.length === 0) {
    Logger.warning(`No scripts found containing "${keyword}"`);
    return;
  }

  Logger.info(`Found ${scripts.length} scripts:\n`);

  scripts.forEach(script => {
    console.log(`  ${script.id}`);
    console.log(`    Name: ${script.name}`);
    console.log(`    Description: ${script.description}`);
    console.log('');
  });
}

export async function marketRunCommand(scriptId: string): Promise<void> {
  const script = marketplace.getById(scriptId);

  if (!script) {
    Logger.error(`Script "${scriptId}" not found`);
    return;
  }

  Logger.info(`Script: ${script.name}`);
  Logger.info(`Description: ${script.description}\n`);

  let commandsToExecute: string[] = [];

  // Handle document mode or command mode
  if (script.documentContent) {
    Logger.info(`Document type: ${script.documentType === 'markdown' ? 'Markdown' : 'Plain text'}\n`);
    Logger.info('Document content:');
    console.log('─'.repeat(50));
    console.log(script.documentContent);
    console.log('─'.repeat(50));
    console.log('');

    Logger.info('Using AI to analyze document and extract commands...\n');

    try {
      const config = ConfigManager.load();
      if (!config) {
        Logger.error('Please run "openasst config" first to set up API key');
        return;
      }
      const aiAssistant = new AIAssistant(config);
      const aiPrompt = `Analyze the following document and extract the list of commands to execute. Return only commands, one per line, no other text.

Document content:
${script.documentContent}

Extract commands:`;

      const aiResponse = await aiAssistant.chat(aiPrompt);
      commandsToExecute = aiResponse.trim().split('\n').filter(cmd => cmd.trim() && !cmd.startsWith('#'));

      Logger.info('AI extracted commands:');
      commandsToExecute.forEach((cmd, i) => {
        console.log(`  ${i + 1}. ${cmd}`);
      });
      console.log('');
    } catch (error) {
      Logger.error(`AI analysis failed: ${(error as Error).message}`);
      return;
    }
  } else {
    Logger.info('Commands to execute:');
    script.commands.forEach((cmd, i) => {
      console.log(`  ${i + 1}. ${cmd}`);
    });
    console.log('');
    commandsToExecute = script.commands;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Execute?',
    default: true
  }]);

  if (!confirm) {
    Logger.info('Cancelled');
    return;
  }

  // Execute commands
  for (const command of commandsToExecute) {
    Logger.command(command);
    const log = await executor.execute(command);

    if (log.output) {
      Logger.output(log.output);
    }

    if (log.exitCode !== 0) {
      Logger.error(`Command failed (exit code: ${log.exitCode})`);
      if (log.error) {
        Logger.error(log.error);
      }
      break;
    } else {
      Logger.success('Command executed successfully');
    }
    console.log('');
  }
}
