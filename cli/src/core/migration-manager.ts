import { CommandExecutor } from './executor';
import { ProjectInfo } from './project-analyzer';
import { Logger } from '../utils/logger';

export interface MigrationResult {
  success: boolean;
  output: string;
  migrationsRun: number;
}

export class MigrationManager {
  private executor: CommandExecutor;

  constructor() {
    this.executor = new CommandExecutor();
  }

  /**
   * Detect and run database migrations
   */
  async runMigrations(
    projectPath: string,
    projectInfo: ProjectInfo
  ): Promise<MigrationResult> {
    const migrationCmd = this.detectMigrationCommand(projectInfo);

    if (!migrationCmd) {
      return {
        success: true,
        output: 'No migration command detected',
        migrationsRun: 0
      };
    }

    Logger.info(`Running migration: ${migrationCmd}`);
    const log = await this.executor.execute(
      `cd "${projectPath}" && ${migrationCmd}`
    );

    return {
      success: log.exitCode === 0,
      output: log.output,
      migrationsRun: this.countMigrations(log.output)
    };
  }

  /**
   * Detect migration command
   */
  private detectMigrationCommand(info: ProjectInfo): string | null {
    // Check package.json scripts
    if (info.scripts['migrate']) {
      return 'npm run migrate';
    }
    if (info.scripts['db:migrate']) {
      return 'npm run db:migrate';
    }

    // Detect based on framework
    if (info.framework === 'Django') {
      return 'python manage.py migrate';
    }
    if (info.framework === 'Rails') {
      return 'rails db:migrate';
    }

    // Check common ORMs
    if (info.dependencies.includes('prisma')) {
      return 'npx prisma migrate deploy';
    }
    if (info.dependencies.includes('typeorm')) {
      return 'npx typeorm migration:run';
    }
    if (info.dependencies.includes('sequelize')) {
      return 'npx sequelize-cli db:migrate';
    }
    if (info.dependencies.includes('knex')) {
      return 'npx knex migrate:latest';
    }

    return null;
  }

  private countMigrations(output: string): number {
    const match = output.match(/(\d+)\s*migration/i);
    return match ? parseInt(match[1]) : 0;
  }
}
