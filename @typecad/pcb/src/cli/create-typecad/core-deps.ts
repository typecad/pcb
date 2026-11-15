// ---------------------------------------------------------------------------
// core-deps.ts — the dependency line every fresh project installs, shared by
// `typecad-pcb create` (installs it) and `typecad-pcb doctor` (recommends/repairs it).
//
// @typecad/pcb ships the passives factories built in, so the install line is
// a single versioned package plus `tsx` — there is no second package whose
// line could fall out of step and ERESOLVE.
//
// `~`, not `^` — cmd.exe (the shell used to spawn npm on Windows) eats carets.
//
// The pin is DERIVED from the version of the CLI the user ran (this
// package's own package.json), so a scaffold always pins the release it was
// created with — a hardcoded literal here drifts the moment a new alpha
// ships. `~` lets patch-level and new prerelease versions of the same line
// satisfy it.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** This package's own version — the release the user is running. */
function packageVersion(): string {
  try {
    // src/cli/create-typecad/ and dist/cli/create-typecad/ sit at the same
    // depth, so ../../../package.json is the package root either way.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** 'tsx' → 'tsx'; '@typecad/pcb@~1.0.0-alpha.4' → '@typecad/pcb'. */
function nameOf(spec: string): string {
  // Search past index 0 so the scope's leading '@' is not the match.
  const at = spec.indexOf('@', 1);
  return at === -1 ? spec : spec.slice(0, at);
}

/** The install line `typecad-pcb create` uses. Single source: doctor's fix must
 *  install exactly what create would. */
export const CORE_DEPENDENCIES: readonly string[] = ['tsx', `@typecad/pcb@~${packageVersion()}`];

const SPEC_FOR: Readonly<Record<string, string>> = Object.fromEntries(
  CORE_DEPENDENCIES.map((spec) => [nameOf(spec), spec]),
);

function declaredSpec(pkg: Record<string, unknown> | null, name: string): string | undefined {
  if (!pkg) return undefined;
  for (const section of ['dependencies', 'devDependencies']) {
    const deps = pkg[section] as Record<string, string> | undefined;
    const spec = deps?.[name];
    if (spec) return spec;
  }
  return undefined;
}

export interface CoreDepsFix {
  /** The `npm install` argument list that repairs the missing deps. */
  args: readonly string[];
  /** Names of legacy packages this project still depends on (pre-rename
   *  `@typecad/typecad` / `@typecad/passives`) that should migrate to
   *  `@typecad/pcb`. Empty for current projects. */
  legacy: readonly string[];
}

/**
 * Compute the dependency specs a `doctor --fix` should install for the
 * missing core deps, in the project's own package.json context: missing
 * deps get create's pinned line; any legacy pre-rename dependency is
 * reported so doctor can point the project at `@typecad/pcb`.
 */
export function coreDepsFix(missing: readonly string[], pkgJson: unknown): CoreDepsFix {
  const pkg = (pkgJson && typeof pkgJson === 'object' ? pkgJson : null) as Record<string, unknown> | null;
  const legacy: string[] = [];
  for (const name of ['@typecad/typecad', '@typecad/passives']) {
    if (declaredSpec(pkg, name)) legacy.push(name);
  }
  return {
    args: missing.map((name) => SPEC_FOR[name] ?? name),
    legacy,
  };
}
