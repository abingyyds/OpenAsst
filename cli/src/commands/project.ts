import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { ProjectAnalyzer } from '../core/project-analyzer';

export async function projectAnalyzeCommand(dir?: string): Promise<void> {
  const projectPath = dir || process.cwd();
  const analyzer = new ProjectAnalyzer();

  Logger.info(`Analyzing project: ${projectPath}\n`);

  try {
    const info = await analyzer.analyze(projectPath);

    console.log('┌─────────────────────────────────────┐');
    console.log(`│ Project: ${info.name.padEnd(25)} │`);
    console.log('├─────────────────────────────────────┤');
    console.log(`│ Type: ${info.type.padEnd(28)} │`);
    console.log(`│ Language: ${info.language.padEnd(24)} │`);

    if (info.framework) {
      console.log(`│ Framework: ${info.framework.padEnd(23)} │`);
    }

    if (info.packageManager) {
      console.log(`│ Package Manager: ${info.packageManager.padEnd(17)} │`);
    }

    console.log('└─────────────────────────────────────┘');

    if (Object.keys(info.scripts).length > 0) {
      Logger.info('\nAvailable scripts:');
      Object.entries(info.scripts).forEach(([name, cmd]) => {
        console.log(`  ${name}: ${cmd}`);
      });
    }

    if (info.envVars.length > 0) {
      Logger.info('\nEnvironment variables:');
      info.envVars.forEach(v => console.log(`  - ${v}`));
    }

    if (info.ports.length > 0) {
      Logger.info('\nDetected ports:');
      info.ports.forEach(p => console.log(`  - ${p}`));
    }

  } catch (error) {
    Logger.error('Analysis failed: ' + (error as Error).message);
  }
}
