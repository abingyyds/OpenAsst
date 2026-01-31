import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { AutoDeployEngine } from '../core/auto-deploy-engine';
import { ResultPresenter, TaskResult } from '../core/result-presenter';

export async function autoDeployCommand(
  source: string,
  options: any
): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  const engine = new AutoDeployEngine(config);
  const presenter = new ResultPresenter();
  const startTime = Date.now();

  // Collect config
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'branch',
      message: 'Branch (leave empty for default):',
      default: options.branch || ''
    },
    {
      type: 'input',
      name: 'targetDir',
      message: 'Target directory:',
      default: options.dir || ''
    },
    {
      type: 'confirm',
      name: 'autoFix',
      message: 'Enable AI auto-fix for code errors?',
      default: true
    },
    {
      type: 'confirm',
      name: 'requireConfirm',
      message: 'Require confirmation before code changes?',
      default: true
    }
  ]);

  // Optional SSL config
  let sslConfig: any = {};
  const { setupSSL } = await inquirer.prompt([{
    type: 'confirm',
    name: 'setupSSL',
    message: 'Configure SSL certificate?',
    default: false
  }]);

  if (setupSSL) {
    sslConfig = await inquirer.prompt([
      { type: 'input', name: 'domain', message: 'Domain:' },
      { type: 'input', name: 'email', message: 'Email (for cert notifications):' }
    ]);
  }

  Logger.info('\nStarting full auto deployment...\n');

  const success = await engine.deploy({
    source,
    branch: answers.branch || undefined,
    targetDir: answers.targetDir || undefined,
    autoFix: answers.autoFix,
    requireConfirm: answers.requireConfirm,
    domain: sslConfig.domain,
    email: sslConfig.email
  });

  // Show result
  const result: TaskResult = {
    success,
    task: `Auto deploy: ${source}`,
    duration: Date.now() - startTime,
    stepsCompleted: success ? 8 : 0,
    totalSteps: 8,
    outputs: [],
    errors: success ? [] : ['Deployment failed']
  };

  presenter.showResult(result);

  // Suggest next steps
  const nextSteps = presenter.suggestNextSteps('deploy', undefined, success);
  presenter.showNextSteps(nextSteps);
}