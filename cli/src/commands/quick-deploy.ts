import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { TemplateManager } from '../core/template-manager';
import { DeployEngine } from '../core/deploy-engine';

export async function quickDeployCommand(templateId?: string): Promise<void> {
  const config = ConfigManager.load();
  if (!config) {
    Logger.error('Please run "openasst config" first');
    return;
  }

  const templateMgr = new TemplateManager();
  const engine = new DeployEngine(config);

  // If no template specified, show selection list
  if (!templateId) {
    const templates = templateMgr.getAll();

    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message: 'Select deploy template:',
      choices: templates.map(t => ({
        name: `${t.name} - ${t.description}`,
        value: t.id
      }))
    }]);

    templateId = selected;
  }

  const template = templateMgr.getById(templateId!);
  if (!template) {
    Logger.error(`Template not found: ${templateId}`);
    return;
  }

  Logger.info(`\nUsing template: ${template.name}`);
  Logger.info(`Description: ${template.description}\n`);

  // Show steps
  Logger.info('Deploy steps:');
  template.plan.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.description}`);
    console.log(`     $ ${s.command}`);
  });

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: '\nStart deployment?',
    default: true
  }]);

  if (!confirm) {
    Logger.info('Cancelled');
    return;
  }

  // Execute deployment
  const result = await engine.executeDeploy(template.plan, {
    autoFix: true,
    maxRetries: 3
  });

  if (result.success) {
    Logger.success('\nDeployment completed!');
  } else {
    Logger.error('\nDeployment failed');
  }
}

export function listTemplatesCommand(): void {
  const templateMgr = new TemplateManager();
  const templates = templateMgr.getAll();

  Logger.info('Available deploy templates:\n');

  templates.forEach(t => {
    console.log(`  ${t.id.padEnd(12)} ${t.name}`);
    console.log(`  ${''.padEnd(12)} ${t.description}`);
    console.log(`  ${''.padEnd(12)} Tags: ${t.tags.join(', ')}`);
    console.log('');
  });
}
