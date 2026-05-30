import chalk from 'chalk';
import { listSkills, getSkill, getCategories, getSkillsByCategory } from '../skills/registry.js';
import type { ParsedArgs } from '../parser.js';
import type { Skill } from '../skills/types.js';
import logger from '../../../logging.js';

function formatSkillHuman(skill: Skill): void {
  logger.log(chalk.white.bold(skill.name) + chalk.gray(` [${skill.category}]`));
  logger.log('');
  logger.log(chalk.white('Description:'));
  logger.log(`  ${skill.description}`);
  logger.log('');

  if (skill.package) {
    logger.log(chalk.white('Package:'));
    logger.log(`  ${skill.package}`);
    logger.log('');
  }

  if (skill.import) {
    logger.log(chalk.white('Import:'));
    logger.log(`  ${skill.import}`);
    logger.log('');
  }

  if (skill.usage) {
    logger.log(chalk.white('Usage:'));
    logger.log(`  ${skill.usage.signature}`);
    if (skill.usage.parameters.length > 0) {
      logger.log('');
      for (const p of skill.usage.parameters) {
        const req = p.required ? chalk.red('*') : '';
        const def = p.default ? chalk.gray(` (default: ${p.default})`) : '';
        logger.log(`    ${chalk.cyan(p.name)}${req} ${chalk.gray(`<${p.type}>`)}${def}`);
        logger.log(`      ${p.description}`);
      }
    }
    logger.log('');
  }

  if (skill.examples.length > 0) {
    logger.log(chalk.white('Examples:'));
    for (const ex of skill.examples) {
      logger.log(chalk.cyan(`  ${ex.title}:`));
      for (const line of ex.code.split('\n')) {
        logger.log(`    ${line}`);
      }
      logger.log('');
    }
  }

  if (skill.notes.length > 0) {
    logger.log(chalk.white('Notes:'));
    for (const note of skill.notes) {
      logger.log(`  - ${note}`);
    }
    logger.log('');
  }

  if (skill.related.length > 0) {
    logger.log(chalk.white('Related skills:'));
    logger.log(`  ${skill.related.join(', ')}`);
    logger.log('');
  }
}

function formatListHuman(): void {
  logger.log(chalk.white.bold('typeCAD Skills') + '\n');

  const categories = getCategories();
  for (const cat of categories) {
    const skills = getSkillsByCategory(cat);
    logger.log(chalk.cyan.bold(cat));
    for (const s of skills) {
      const desc = s.description.length > 70 ? s.description.slice(0, 67) + '...' : s.description;
      logger.log(`  ${chalk.white(s.name.padEnd(22))} ${desc}`);
    }
    logger.log('');
  }

  logger.log(chalk.gray("Use 'typecad skills get <name>' for details on a skill."));
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const subcommand = parsed.subcommand;

  if (!subcommand || subcommand === 'list') {
    if (parsed.json) {
      logger.log(JSON.stringify(listSkills(), null, 2));
    } else {
      formatListHuman();
    }
    return;
  }

  if (subcommand === 'get') {
    const skillName = parsed.positional[0];
    if (!skillName) {
      if (parsed.json) {
        logger.log(JSON.stringify({ error: true, message: 'Skill name required. Usage: typecad skills get <name>', code: 'MISSING_SKILL_NAME' }));
      } else {
        logger.error(chalk.red('Skill name required.'));
        logger.log("Usage: typecad skills get <name>");
      }
      process.exit(1);
    }

    const skill = getSkill(skillName);
    if (!skill) {
      if (parsed.json) {
        logger.log(JSON.stringify({ error: true, message: `Unknown skill '${skillName}'. Run 'typecad skills list' for available skills.`, code: 'UNKNOWN_SKILL' }));
      } else {
        logger.error(chalk.red(`Unknown skill '${skillName}'.`));
        logger.log("Run 'typecad skills list' for available skills.");
      }
      process.exit(1);
    }

    if (parsed.json) {
      logger.log(JSON.stringify(skill, null, 2));
    } else {
      formatSkillHuman(skill);
    }
    return;
  }

  if (parsed.json) {
    logger.log(JSON.stringify({ error: true, message: `Unknown subcommand 'skills ${subcommand}'. Use 'list' or 'get'.`, code: 'UNKNOWN_SUBCOMMAND' }));
  } else {
    logger.error(chalk.red(`Unknown subcommand 'skills ${subcommand}'. Use 'list' or 'get'.`));
  }
  process.exit(1);
}
