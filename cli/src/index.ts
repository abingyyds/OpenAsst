#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { configCommand } from './commands/config';
import { aiCommand } from './commands/ai';
import { marketListCommand, marketSearchCommand, marketRunCommand } from './commands/market';
import { deployCommand, deployTextCommand } from './commands/deploy';
import { monitorStartCommand, monitorStatusCommand } from './commands/monitor';
import { interactiveCommand } from './commands/interactive';
import { projectAnalyzeCommand } from './commands/project';
import { quickDeployCommand, listTemplatesCommand } from './commands/quick-deploy';
import {
  serviceStartCommand,
  serviceStopCommand,
  serviceRestartCommand,
  serviceListCommand,
  serviceLogsCommand
} from './commands/service';
import { autoDeployCommand } from './commands/auto-deploy';
import { doCommand, doInteractiveCommand } from './commands/do';
import { shareAPICommand, exportEnvCommand, listToolsCommand } from './commands/api';
import { skillListCommand, skillInitCommand, skillRunCommand, skillRemoveCommand } from './commands/skill';
import { scheduleListCommand, scheduleAddCommand, scheduleRemoveCommand, scheduleToggleCommand } from './commands/schedule';

const program = new Command();

// Custom help formatting
program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => chalk.cyan(cmd.name()) + ' ' + chalk.gray(cmd.usage()),
});

// Custom help output
program.addHelpText('beforeAll', `
${chalk.green('╔═══════════════════════════════════════════════════════════╗')}
${chalk.green('║')}  ${chalk.bold.white('OpenAsst CLI')} - ${chalk.gray('AI-powered terminal assistant')}        ${chalk.green('║')}
${chalk.green('╚═══════════════════════════════════════════════════════════╝')}
`);

program.addHelpText('after', `
${chalk.yellow('Examples:')}
  ${chalk.gray('$')} ${chalk.cyan('openasst config')}          ${chalk.gray('# Configure API key')}
  ${chalk.gray('$')} ${chalk.cyan('openasst do "install nginx"')} ${chalk.gray('# Execute task with AI')}
  ${chalk.gray('$')} ${chalk.cyan('openasst assistant')}       ${chalk.gray('# Interactive mode')}
  ${chalk.gray('$')} ${chalk.cyan('openasst market')}          ${chalk.gray('# Browse script marketplace')}

${chalk.gray('Documentation: https://github.com/abingyyds/OpenAsst')}
`);

program
  .name('openasst')
  .description(chalk.gray('AI-powered terminal assistant for deployment and system operations'))
  .version('1.0.0');

// Config
program
  .command('config')
  .description('Configure API key and settings')
  .action(configCommand);

// AI assistant
program
  .command('ai <task>')
  .description('Execute task with AI assistance')
  .action(aiCommand);

// Smart task engine - natural language system operations
program
  .command('do <task>')
  .description('Execute any task using natural language')
  .option('-y, --yes', 'Auto-confirm all actions')
  .option('-d, --dir <path>', 'Working directory')
  .option('-v, --verbose', 'Verbose output')
  .action(doCommand);

program
  .command('assistant')
  .description('Interactive smart assistant mode')
  .action(doInteractiveCommand);

// Interactive mode
program
  .command('chat')
  .description('Interactive mode - real-time deployment and configuration')
  .option('-d, --dir <path>', 'Working directory')
  .action(interactiveCommand);

// Project analysis
program
  .command('analyze [dir]')
  .description('Analyze project structure')
  .action(projectAnalyzeCommand);

// Quick deploy
program
  .command('quick [template]')
  .description('Quick deploy using templates')
  .action(quickDeployCommand);

program
  .command('templates')
  .description('List all deployment templates')
  .action(listTemplatesCommand);

// Full auto deploy
program
  .command('auto <source>')
  .description('Full auto deploy - Git/Env/Build/Start/SSL')
  .option('-b, --branch <branch>', 'Git branch')
  .option('-d, --dir <path>', 'Target directory')
  .action(autoDeployCommand);

// Deploy from docs
program
  .command('deploy <source>')
  .description('Deploy from documentation (URL/file/text)')
  .option('-n, --name <name>', 'Project name')
  .option('--dry-run', 'Dry run mode')
  .option('--no-auto-fix', 'Disable auto error fix')
  .option('-r, --retries <number>', 'Max retries', '3')
  .action(deployCommand);

program
  .command('deploy-text')
  .description('Deploy from terminal input')
  .action(deployTextCommand);

// Monitor
const monitor = program
  .command('monitor')
  .description('Project monitoring');

monitor
  .command('start')
  .description('Start monitoring')
  .option('--new', 'Create new monitor config')
  .action(monitorStartCommand);

monitor
  .command('status')
  .description('View monitor status')
  .action(monitorStatusCommand);

// Marketplace
const market = program
  .command('market')
  .description('Script marketplace');

market
  .command('list')
  .description('List all scripts')
  .action(marketListCommand);

market
  .command('search <keyword>')
  .description('Search scripts')
  .action(marketSearchCommand);

market
  .command('run <script-id>')
  .description('Run a script')
  .action(marketRunCommand);

// Service management
const service = program
  .command('service')
  .description('Background service management');

service
  .command('start <name> <command>')
  .description('Start a background service')
  .option('-d, --dir <path>', 'Working directory')
  .action(serviceStartCommand);

service
  .command('stop <name>')
  .description('Stop a service')
  .action(serviceStopCommand);

service
  .command('restart <name>')
  .description('Restart a service')
  .action(serviceRestartCommand);

service
  .command('list')
  .description('List all services')
  .action(serviceListCommand);

service
  .command('logs <name>')
  .description('View service logs')
  .option('-n, --lines <number>', 'Number of lines', '50')
  .action(serviceLogsCommand);

// API sharing
const api = program
  .command('api')
  .description('API sharing and management');

api
  .command('share [tool]')
  .description('Share API with other AI tools')
  .action(shareAPICommand);

api
  .command('export')
  .description('Export API as environment variables')
  .action(exportEnvCommand);

api
  .command('tools')
  .description('List available tools for API sharing')
  .action(listToolsCommand);

// Skill management
const skill = program
  .command('skill')
  .description('Skill management');

skill
  .command('list')
  .description('List installed skills')
  .action(skillListCommand);

skill
  .command('init')
  .description('Install built-in skills')
  .action(skillInitCommand);

skill
  .command('run <skill-id> <command>')
  .description('Run a skill command')
  .action(skillRunCommand);

skill
  .command('remove <skill-id>')
  .description('Remove a skill')
  .action(skillRemoveCommand);

// Schedule management
const schedule = program
  .command('schedule')
  .description('Scheduled tasks management');

schedule
  .command('list')
  .description('List scheduled tasks')
  .action(scheduleListCommand);

schedule
  .command('add')
  .description('Add a scheduled task')
  .action(scheduleAddCommand);

schedule
  .command('remove <task-id>')
  .description('Remove a scheduled task')
  .action(scheduleRemoveCommand);

schedule
  .command('toggle <task-id>')
  .description('Enable/disable a task')
  .option('--enable', 'Enable task')
  .option('--disable', 'Disable task')
  .action(scheduleToggleCommand);

program.parse();