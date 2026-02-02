import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';

interface ConfigOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export async function configCommand(options?: ConfigOptions): Promise<void> {
  // Non-interactive mode: if apiKey is provided via options
  if (options?.apiKey) {
    const config = {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl || undefined,
      model: options.model || 'claude-3-5-sonnet-20241022'
    };
    ConfigManager.save(config);
    Logger.success('Config saved to: ' + ConfigManager.getConfigPath());
    return;
  }

  // Interactive mode
  Logger.info('Configure OpenAsst CLI');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'Anthropic API Key:',
      validate: (input: string) => input.length > 0 || 'API Key cannot be empty'
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'API Base URL (optional, press Enter for default):',
      default: ''
    },
    {
      type: 'list',
      name: 'model',
      message: 'Select model:',
      choices: [
        { name: 'Claude 3.5 Sonnet (Recommended)', value: 'claude-3-5-sonnet-20241022' },
        { name: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
        { name: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229' },
        { name: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' }
      ]
    },
    {
      type: 'confirm',
      name: 'configureSearch',
      message: 'Configure search API? (Enable AI smart search)',
      default: false
    }
  ]);

  let searchConfig = {};
  if (answers.configureSearch) {
    const searchAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'tavilyApiKey',
        message: 'Tavily API Key (recommended, optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'serperApiKey',
        message: 'Serper API Key (alternative, optional):',
        default: ''
      }
    ]);

    searchConfig = {
      tavilyApiKey: searchAnswers.tavilyApiKey || undefined,
      serperApiKey: searchAnswers.serperApiKey || undefined
    };
  }

  const config = {
    apiKey: answers.apiKey,
    baseUrl: answers.baseUrl || undefined,
    model: answers.model,
    ...searchConfig
  };

  ConfigManager.save(config);
  Logger.success('Config saved to: ' + ConfigManager.getConfigPath());

  if (answers.configureSearch && (searchConfig as any).tavilyApiKey || (searchConfig as any).serperApiKey) {
    Logger.info('Search API configured, AI can now search command marketplace, knowledge base and internet');
  }
}
