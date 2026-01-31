import inquirer from 'inquirer';
import { Logger } from '../utils/logger';
import { SkillManager } from '../core/skill-manager';

const skillManager = new SkillManager();

export async function skillListCommand(): Promise<void> {
  const skills = skillManager.getInstalledSkills();

  if (skills.length === 0) {
    Logger.warning('No skills installed');
    Logger.info('Run "openasst skill init" to install built-in skills');
    return;
  }

  Logger.info(`Installed skills (${skills.length}):\n`);
  skills.forEach(skill => {
    console.log(`  ${skill.id} (v${skill.version})`);
    console.log(`    ${skill.description}`);
    console.log(`    Commands: ${skill.commands.map(c => c.name).join(', ')}`);
    console.log('');
  });
}

export async function skillInitCommand(): Promise<void> {
  Logger.info('Installing built-in skills...');
  await skillManager.installBuiltinSkills();
  Logger.success('Built-in skills installed');
}

export async function skillRunCommand(
  skillId: string,
  commandName: string,
  options: any
): Promise<void> {
  const result = await skillManager.executeSkillCommand(
    skillId,
    commandName,
    options
  );

  if (result.success) {
    Logger.output(result.output);
  } else {
    Logger.error(result.output);
  }
}

export async function skillRemoveCommand(skillId: string): Promise<void> {
  skillManager.uninstallSkill(skillId);
}
