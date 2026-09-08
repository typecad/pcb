import type { Skill, SkillSummary } from './types.js';
import { coreSkills } from './core.js';
import { passiveSkills } from './passives.js';
import { layoutSkills } from './layout.js';
import { graphicsSkills } from './graphics.js';
import { validationSkills } from './validation.js';
import { projectSkills } from './project.js';
import { packageSkills } from './packages.js';
import { configSkills } from './config.js';
import { advancedSkills } from './advanced.js';
import { kicadSkills } from './kicad.js';
import { workflowSkills } from './workflow.js';
import { agentLoopSkills } from './agent_loop.js';

const allSkills: Skill[] = [
  ...workflowSkills,
  ...agentLoopSkills,
  ...coreSkills,
  ...passiveSkills,
  ...layoutSkills,
  ...graphicsSkills,
  ...validationSkills,
  ...projectSkills,
  ...packageSkills,
  ...configSkills,
  ...advancedSkills,
  ...kicadSkills,
];

const skillMap = new Map<string, Skill>();
for (const skill of allSkills) {
  skillMap.set(skill.name, skill);
}

export function listSkills(): SkillSummary[] {
  return allSkills.map((s) => ({
    name: s.name,
    category: s.category,
    description: s.description,
  }));
}

export function getSkill(name: string): Skill | undefined {
  return skillMap.get(name);
}

export function getSkillNames(): string[] {
  return allSkills.map((s) => s.name);
}

export function getCategories(): string[] {
  const cats = new Set(allSkills.map((s) => s.category));
  return [...cats];
}

export function getSkillsByCategory(category: string): SkillSummary[] {
  return allSkills
    .filter((s) => s.category === category)
    .map((s) => ({ name: s.name, category: s.category, description: s.description }));
}
