import chalk from 'chalk';

export class Logger {
  static info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  static success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  static error(message: string): void {
    console.log(chalk.red('✗'), message);
  }

  static warning(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  static command(command: string): void {
    console.log(chalk.cyan('$'), chalk.gray(command));
  }

  static output(output: string): void {
    console.log(chalk.gray(output));
  }
}
