import { CommandExecutor } from './executor';
import { Logger } from '../utils/logger';

export interface SSLConfig {
  domain: string;
  email: string;
  webroot?: string;
  standalone?: boolean;
}

export class SSLManager {
  private executor: CommandExecutor;

  constructor() {
    this.executor = new CommandExecutor();
  }

  /**
   * Check if certbot is installed
   */
  async checkCertbotInstalled(): Promise<boolean> {
    const log = await this.executor.execute('which certbot');
    return log.exitCode === 0;
  }

  /**
   * Install certbot
   */
  async installCertbot(): Promise<boolean> {
    Logger.info('Installing certbot...');

    const cmds = [
      'sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx',
      'sudo yum install -y certbot python3-certbot-nginx',
      'sudo dnf install -y certbot python3-certbot-nginx'
    ];

    for (const cmd of cmds) {
      const log = await this.executor.execute(cmd);
      if (log.exitCode === 0) {
        Logger.success('certbot installed successfully');
        return true;
      }
    }

    Logger.error('certbot installation failed');
    return false;
  }

  /**
   * Obtain SSL certificate
   */
  async obtainCertificate(config: SSLConfig): Promise<boolean> {
    // Ensure certbot is installed
    if (!await this.checkCertbotInstalled()) {
      await this.installCertbot();
    }

    let cmd: string;

    if (config.standalone) {
      cmd = `sudo certbot certonly --standalone -d ${config.domain} --email ${config.email} --agree-tos --non-interactive`;
    } else if (config.webroot) {
      cmd = `sudo certbot certonly --webroot -w ${config.webroot} -d ${config.domain} --email ${config.email} --agree-tos --non-interactive`;
    } else {
      cmd = `sudo certbot --nginx -d ${config.domain} --email ${config.email} --agree-tos --non-interactive`;
    }

    Logger.info(`Obtaining certificate: ${config.domain}`);
    const log = await this.executor.execute(cmd);

    if (log.exitCode === 0) {
      Logger.success('Certificate obtained successfully');
      return true;
    }

    Logger.error(`Certificate request failed: ${log.error || log.output}`);
    return false;
  }

  /**
   * Setup auto renewal
   */
  async setupAutoRenewal(): Promise<boolean> {
    const cmd = 'sudo systemctl enable certbot.timer && sudo systemctl start certbot.timer';
    const log = await this.executor.execute(cmd);

    if (log.exitCode === 0) {
      Logger.success('Auto renewal configured');
      return true;
    }

    // Try cron method
    const cronCmd = '(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet") | crontab -';
    const cronLog = await this.executor.execute(cronCmd);

    return cronLog.exitCode === 0;
  }
}
