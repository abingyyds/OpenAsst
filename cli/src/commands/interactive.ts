import * as readline from 'readline';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { InteractiveEngine } from '../core/interactive-engine';

export async function interactiveCommand(options: any): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  const workingDir = options.dir || process.cwd();
  const engine = new InteractiveEngine(config, workingDir);

  Logger.info('Initializing AI assistant...\n');
  await engine.initialize();

  Logger.info('\n=== OpenAsst Interactive Mode ===');
  Logger.info('Enter your request, AI will execute automatically');
  Logger.info('Type "exit" to quit\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = () => {
    rl.question('\n> ', async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === 'exit') {
        Logger.info('Goodbye!');
        rl.close();
        return;
      }

      if (!trimmed) {
        prompt();
        return;
      }

      try {
        console.log('');
        const response = await engine.chat(trimmed);
        console.log('\n' + response);
      } catch (error) {
        Logger.error('Error: ' + (error as Error).message);
      }

      prompt();
    });
  };

  prompt();
}