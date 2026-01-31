import { Logger } from '../utils/logger';
import { ProjectInfo } from './project-analyzer';

export interface TaskResult {
  success: boolean;
  task: string;
  duration: number;
  stepsCompleted: number;
  totalSteps: number;
  outputs: string[];
  errors: string[];
}

export interface NextStep {
  command: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export class ResultPresenter {
  /**
   * Display task completion result
   */
  showResult(result: TaskResult): void {
    console.log('\n' + '='.repeat(50));
    console.log('  TASK RESULT');
    console.log('='.repeat(50));

    const status = result.success ? '✓ SUCCESS' : '✗ FAILED';
    const statusColor = result.success ? '\x1b[32m' : '\x1b[31m';

    console.log(`\n  Status: ${statusColor}${status}\x1b[0m`);
    console.log(`  Task: ${result.task}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`  Progress: ${result.stepsCompleted}/${result.totalSteps} steps`);

    if (result.outputs.length > 0) {
      console.log('\n  Outputs:');
      result.outputs.slice(-5).forEach(o => {
        console.log(`    • ${o.substring(0, 80)}`);
      });
    }

    if (result.errors.length > 0) {
      console.log('\n  Errors:');
      result.errors.forEach(e => {
        console.log(`    \x1b[31m• ${e}\x1b[0m`);
      });
    }

    console.log('\n' + '='.repeat(50));
  }

  /**
   * Suggest next steps based on context
   */
  suggestNextSteps(
    taskType: string,
    projectInfo?: ProjectInfo,
    success?: boolean
  ): NextStep[] {
    const suggestions: NextStep[] = [];

    // Based on task type
    switch (taskType) {
      case 'deploy':
      case 'auto':
        if (success) {
          suggestions.push(
            { command: 'openasst monitor start', description: 'Start monitoring the deployed service', priority: 'high' },
            { command: 'openasst service list', description: 'View running services', priority: 'medium' }
          );
        } else {
          suggestions.push(
            { command: 'openasst do "fix the deployment error"', description: 'Let AI analyze and fix the error', priority: 'high' },
            { command: 'openasst chat', description: 'Enter interactive mode for debugging', priority: 'medium' }
          );
        }
        break;

      case 'install':
        suggestions.push(
          { command: 'openasst analyze', description: 'Analyze project structure', priority: 'medium' },
          { command: 'openasst quick', description: 'Quick deploy with templates', priority: 'medium' }
        );
        break;

      case 'analyze':
        if (projectInfo) {
          suggestions.push(
            { command: `openasst auto .`, description: 'Auto deploy this project', priority: 'high' },
            { command: 'openasst chat', description: 'Configure project interactively', priority: 'medium' }
          );
        }
        break;

      case 'fix':
        if (success) {
          suggestions.push(
            { command: 'openasst do "verify the fix works"', description: 'Verify the fix', priority: 'high' },
            { command: 'openasst do "run tests"', description: 'Run tests to confirm', priority: 'medium' }
          );
        } else {
          suggestions.push(
            { command: 'openasst assistant', description: 'Enter interactive mode for manual debugging', priority: 'high' }
          );
        }
        break;

      case 'build':
        if (success) {
          suggestions.push(
            { command: 'openasst do "start the application"', description: 'Start the built application', priority: 'high' },
            { command: 'openasst do "run tests"', description: 'Run tests', priority: 'medium' }
          );
        } else {
          suggestions.push(
            { command: 'openasst do "fix build errors"', description: 'Let AI fix build errors', priority: 'high' }
          );
        }
        break;

      case 'general':
      default:
        suggestions.push(
          { command: 'openasst assistant', description: 'Continue with interactive assistant', priority: 'medium' },
          { command: 'openasst do "<your next task>"', description: 'Execute another task', priority: 'low' }
        );
        break;
    }

    // Project-specific suggestions
    if (projectInfo) {
      if (projectInfo.type === 'nodejs' && !projectInfo.scripts['start']) {
        suggestions.push({
          command: 'openasst ai "add start script to package.json"',
          description: 'Add missing start script',
          priority: 'high'
        });
      }

      if (projectInfo.envVars.length > 0) {
        suggestions.push({
          command: 'openasst chat',
          description: 'Configure environment variables',
          priority: 'medium'
        });
      }
    }

    return suggestions;
  }

  /**
   * Display next steps
   */
  showNextSteps(steps: NextStep[]): void {
    if (steps.length === 0) return;

    console.log('\n  SUGGESTED NEXT STEPS:');
    console.log('  ' + '-'.repeat(46));

    steps.forEach((step, i) => {
      const priorityIcon = step.priority === 'high' ? '!' : step.priority === 'medium' ? '>' : '-';
      console.log(`\n  ${i + 1}. ${step.description}`);
      console.log(`     \x1b[36m$ ${step.command}\x1b[0m`);
    });

    console.log('\n');
  }
}
