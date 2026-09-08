import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { listSkills, getSkill, getCategories, getSkillsByCategory } from '../skills/registry.js';
import type { ParsedArgs } from '../parser.js';
import type { Skill } from '../skills/types.js';
import logger from '../../../utils/logging.js';

function scoreSkill(query: string, name: string, description: string, category: string): number {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  const d = description.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 60;
  if (d.includes(q)) return 40;
  if (category.toLowerCase().includes(q)) return 20;
  return 0;
}

function searchSkills(query: string, limit: number) {
  return listSkills()
    .map((s) => ({ ...s, score: scoreSkill(query, s.name, s.description, s.category) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function skillToMarkdown(skill: Skill): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`name: typecad-${skill.name}`);
  lines.push(`description: ${skill.description.replace(/\n/g, ' ')}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${skill.name} (${skill.category})`);
  lines.push('');
  if (skill.import) {
    lines.push('```typescript');
    lines.push(skill.import);
    lines.push('```');
    lines.push('');
  }
  if (skill.usage) {
    lines.push('```typescript');
    lines.push(skill.usage.signature);
    lines.push('```');
    if (skill.usage.parameters.length > 0) {
      lines.push('');
      for (const p of skill.usage.parameters) {
        lines.push(`- \`${p.name}\`${p.required ? ' (required)' : ''} — ${p.description}`);
      }
    }
    lines.push('');
  }
  if (skill.examples.length > 0) {
    for (const ex of skill.examples) {
      lines.push(`## ${ex.title}`);
      lines.push('');
      lines.push('```typescript');
      lines.push(ex.code);
      lines.push('```');
      lines.push('');
    }
  }
  if (skill.notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    for (const note of skill.notes) lines.push(`- ${note}`);
    lines.push('');
  }
  if (skill.related.length > 0) {
    lines.push(`## Related skills`);
    lines.push('');
    for (const r of skill.related) lines.push(`- typecad-${r}`);
    lines.push('');
  }
  return lines.join('\n');
}

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
  logger.log(
    chalk.gray('Start with: ') +
      chalk.white('typecad-pcb skills get circuit-design') +
      chalk.gray(' for the end-to-end design workflow.\n'),
  );

  const categories = getCategories();
  for (const cat of categories) {
    const skills = getSkillsByCategory(cat);
    logger.log(chalk.cyan.bold(cat));
    for (const s of skills) {
      const desc = s.description.length > 120 ? s.description.slice(0, 117) + '...' : s.description;
      logger.log(`  ${chalk.white(s.name.padEnd(22))} ${desc}`);
    }
    logger.log('');
  }

  logger.log(chalk.gray("Use 'typecad-pcb skills get <name>' for details on a skill."));
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

  if (subcommand === 'search') {
    const query = parsed.positional.join(' ');
    if (!query) {
      if (parsed.json) {
        logger.log(
          JSON.stringify({
            error: true,
            message: 'Query required. Usage: typecad-pcb skills search <query>',
            code: 'MISSING_QUERY',
          }),
        );
      } else {
        logger.error(chalk.red('Query required.'));
        logger.log('Usage: typecad-pcb skills search <query>');
      }
      process.exit(1);
    }
    const results = searchSkills(query, 10);
    if (parsed.json) {
      logger.log(
        JSON.stringify(
          results.map(({ name, category, description, score }) => ({ name, category, description, score })),
          null,
          2,
        ),
      );
      return;
    }
    if (results.length === 0) {
      logger.log(chalk.gray(`No skills match '${query}'. Run 'typecad-pcb skills list' for everything.`));
      return;
    }
    logger.log(chalk.white.bold(`Skills matching '${query}'`) + '\n');
    for (const s of results) {
      logger.log(`  ${chalk.white(s.name.padEnd(22))} ${s.description.slice(0, 90)}`);
    }
    logger.log('');
    logger.log(chalk.gray("Use 'typecad-pcb skills get <name>' for details."));
    return;
  }

  if (subcommand === 'export') {
    if (parsed.args['out'] === true) {
      if (parsed.json) {
        logger.log(
          JSON.stringify({
            error: true,
            message: '--out needs a value: typecad-pcb skills export --out <dir>',
            code: 'MISSING_VALUE',
          }),
        );
      } else {
        logger.error(chalk.red('--out needs a value: typecad-pcb skills export --out <dir>'));
      }
      process.exit(1);
    }
    const outDir = typeof parsed.args['out'] === 'string' ? parsed.args['out'] : '.claude/skills';
    const categoryFilter = typeof parsed.args['category'] === 'string' ? parsed.args['category'] : undefined;
    const categories = categoryFilter ? [categoryFilter] : getCategories();
    let written = 0;
    for (const cat of categories) {
      for (const summary of getSkillsByCategory(cat)) {
        const skill = getSkill(summary.name);
        if (!skill) continue;
        const dir = path.join(outDir, `typecad-${skill.name}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), skillToMarkdown(skill), 'utf8');
        written++;
      }
    }
    if (parsed.json) {
      logger.log(JSON.stringify({ ok: true, out: outDir, skills: written }));
    } else {
      logger.log(chalk.green(`✓ exported ${written} skills to ${outDir}/typecad-<name>/SKILL.md`));
    }
    return;
  }

  if (subcommand === 'get') {
    const skillName = parsed.positional[0];
    if (!skillName) {
      if (parsed.json) {
        logger.log(
          JSON.stringify({
            error: true,
            message: 'Skill name required. Usage: typecad-pcb skills get <name>',
            code: 'MISSING_SKILL_NAME',
          }),
        );
      } else {
        logger.error(chalk.red('Skill name required.'));
        logger.log('Usage: typecad-pcb skills get <name>');
      }
      process.exit(1);
    }

    const skill = getSkill(skillName);
    if (!skill) {
      if (parsed.json) {
        logger.log(
          JSON.stringify({
            error: true,
            message: `Unknown skill '${skillName}'. Run 'typecad-pcb skills list' for available skills.`,
            code: 'UNKNOWN_SKILL',
          }),
        );
      } else {
        logger.error(chalk.red(`Unknown skill '${skillName}'.`));
        logger.log("Run 'typecad-pcb skills list' for available skills.");
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
    logger.log(
      JSON.stringify({
        error: true,
        message: `Unknown subcommand 'skills ${subcommand}'. Use 'list', 'get', 'search', or 'export'.`,
        code: 'UNKNOWN_SUBCOMMAND',
      }),
    );
  } else {
    logger.error(chalk.red(`Unknown subcommand 'skills ${subcommand}'. Use 'list', 'get', 'search', or 'export'.`));
  }
  process.exit(1);
}
