#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, AgentConfig } from './config';
import { WSClient } from './ws-client';
import * as os from 'os';

const program = new Command();

program
  .name('openasst-agent')
  .description('OpenAsst Remote Agent')
  .version('1.0.0');

program
  .command('start')
  .description('Start the agent')
  .action(async () => {
    console.log(chalk.green('Starting OpenAsst Agent...'));
    const config = loadConfig();

    if (!config.secretKey) {
      console.log(chalk.red('Error: Secret key not configured'));
      console.log('Run: openasst-agent config');
      process.exit(1);
    }

    const client = new WSClient(config);

    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nShutting down...'));
      client.disconnect();
      process.exit(0);
    });

    try {
      await client.connect();
    } catch (error) {
      console.log(chalk.red('Failed to connect'));
    }
  });

program
  .command('config')
  .description('Configure the agent')
  .action(async () => {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (q: string): Promise<string> => {
      return new Promise(resolve => rl.question(q, resolve));
    };

    const current = loadConfig();

    console.log(chalk.cyan('Configure OpenAsst Agent\n'));

    const host = await question(`Master host [${current.masterHost}]: `);
    const port = await question(`Master port [${current.masterPort}]: `);
    const secret = await question(`Secret key: `);
    const name = await question(`Agent name [${current.agentName}]: `);

    const config: AgentConfig = {
      masterHost: host || current.masterHost,
      masterPort: parseInt(port) || current.masterPort,
      secretKey: secret || current.secretKey,
      agentName: name || current.agentName,
      reconnectInterval: current.reconnectInterval,
      heartbeatInterval: current.heartbeatInterval
    };

    saveConfig(config);
    console.log(chalk.green('\nConfiguration saved!'));
    rl.close();
  });

program
  .command('status')
  .description('Show agent status')
  .action(() => {
    const config = loadConfig();
    console.log(chalk.cyan('Agent Configuration:'));
    console.log(`  Name: ${config.agentName}`);
    console.log(`  Master: ${config.masterHost}:${config.masterPort}`);
    console.log(`  Hostname: ${os.hostname()}`);
  });

program.parse();
