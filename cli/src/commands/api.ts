import inquirer from 'inquirer';
import { Logger } from '../utils/logger';
import { APIProvider } from '../core/api-provider';
import { ApiSync } from '../core/api-sync';

const apiProvider = new APIProvider();

export async function shareAPICommand(tool?: string): Promise<void> {
  if (tool) {
    const success = await apiProvider.shareWithTool(tool);
    if (!success) {
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  const tools = apiProvider.listAvailableTools();

  const { selectedTool } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedTool',
    message: 'Select tool to share API with:',
    choices: tools
  }]);

  await apiProvider.shareWithTool(selectedTool);
}

export async function exportEnvCommand(): Promise<void> {
  const envExport = apiProvider.generateEnvExport();

  if (!envExport) {
    Logger.error('No API configuration found');
    return;
  }

  console.log('\n# Add to your shell profile:\n');
  console.log(envExport);
  console.log('\n# Or run: eval "$(openasst api export)"');
}

export async function listToolsCommand(): Promise<void> {
  const tools = apiProvider.listAvailableTools();

  Logger.info('Available tools for API sharing:\n');
  tools.forEach(tool => {
    console.log(`  - ${tool}`);
  });
}

interface SyncOptions {
  all?: boolean;
  devices?: string;
}

export async function apiSyncCommand(options: SyncOptions): Promise<void> {
  const apiSync = new ApiSync();

  if (options.all) {
    Logger.info('Syncing API config to all devices...\n');
    const result = await apiSync.syncToAll();
    Logger.info(`\nSync complete: ${result.success} success, ${result.failed} failed`);
  } else if (options.devices) {
    const ids = options.devices.split(',').map(d => d.trim());
    Logger.info(`Syncing API config to ${ids.length} device(s)...\n`);
    const result = await apiSync.syncToDevices(ids);
    Logger.info(`\nSync complete: ${result.success} success, ${result.failed} failed`);
  } else {
    Logger.error('Please specify --all or --devices');
  }
}
