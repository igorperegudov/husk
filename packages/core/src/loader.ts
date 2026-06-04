import { chmodSync, constants, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { ManifestError, parseFrontmatter, parseManifest, toSlug } from './manifest';
import type { Skill } from './types';

/** Names that look like a skills root rather than a single skill. */
const SKILL_MANIFEST = 'SKILL.md';

export interface LoadOptions {
  /**
   * When true, a malformed skill throws. When false (default), it is skipped
   * with a warning collected in {@link LoadResult.errors}.
   */
  strict?: boolean;
}

export interface LoadResult {
  skills: Skill[];
  /** Folders that looked like skills but failed to load. */
  errors: Array<{ dir: string; message: string }>;
}

/** True when `argv[0]` refers to a script file inside the skill, not a PATH binary. */
function isLocalScript(arg: string): boolean {
  return arg.startsWith('.') || arg.startsWith('/') || arg.includes('/');
}

/** Best-effort: make a local kernel script executable so `./run.sh` works. */
function ensureExecutable(skillDir: string, arg: string): void {
  const target = isAbsolute(arg) ? arg : resolve(skillDir, arg);
  try {
    const st = statSync(target);
    if (!st.isFile()) {
      return;
    }
    // Add owner-execute if missing; ignore failures (read-only mounts, etc.).
    chmodSync(target, st.mode | constants.S_IXUSR);
  } catch {
    // Missing file is reported later at invoke time with a clear error.
  }
}

/** Load a single skill from its folder. Throws {@link ManifestError} on bad input. */
export function loadSkill(skillDir: string): Skill {
  const dir = resolve(skillDir);
  const manifestPath = join(dir, SKILL_MANIFEST);
  let content: string;
  try {
    content = readFileSync(manifestPath, 'utf-8');
  } catch {
    throw new ManifestError(`no ${SKILL_MANIFEST} found in ${dir}`);
  }

  const folderName = dir.split(/[\\/]/).pop() ?? 'skill';
  const slug = toSlug(folderName);
  const manifest = parseManifest(content, slug);
  // Re-derive the canonical slug from the manifest name when it differs.
  const nameSlug = toSlug(manifest.name) || slug;

  if (manifest.argv.length > 0 && isLocalScript(manifest.argv[0])) {
    ensureExecutable(dir, manifest.argv[0]);
  }
  // Make local LLM tool scripts executable too (e.g. `./tools/lookup.sh`).
  for (const tool of manifest.llm?.tools ?? []) {
    if (tool.command.length > 0 && isLocalScript(tool.command[0])) {
      ensureExecutable(dir, tool.command[0]);
    }
  }

  const { body } = parseFrontmatter(content);
  return { manifest, dir, slug: nameSlug, doc: body };
}

/**
 * Discover and load every skill under `skillsDir`. Each immediate subdirectory
 * containing a `SKILL.md` is treated as one skill. A `SKILL.md` directly in
 * `skillsDir` is also loaded (single-skill folder).
 */
export function loadSkills(skillsDir: string, options: LoadOptions = {}): LoadResult {
  const root = resolve(skillsDir);
  const skills: Skill[] = [];
  const errors: Array<{ dir: string; message: string }> = [];
  const seen = new Map<string, string>();

  const candidates: string[] = [];
  // A SKILL.md at the root means `skillsDir` is itself a single skill.
  try {
    statSync(join(root, SKILL_MANIFEST));
    candidates.push(root);
  } catch {
    let entries: string[] = [];
    try {
      entries = readdirSync(root);
    } catch {
      throw new ManifestError(`skills directory not found: ${root}`);
    }
    for (const entry of entries.sort()) {
      const entryPath = join(root, entry);
      try {
        if (!statSync(entryPath).isDirectory()) {
          continue;
        }
        statSync(join(entryPath, SKILL_MANIFEST));
        candidates.push(entryPath);
      } catch {
        // Not a skill folder; ignore.
      }
    }
  }

  for (const dir of candidates) {
    try {
      const skill = loadSkill(dir);
      const clash = seen.get(skill.slug);
      if (clash) {
        throw new ManifestError(
          `duplicate skill slug "${skill.slug}" (already defined by ${clash})`,
        );
      }
      seen.set(skill.slug, dir);
      skills.push(skill);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (options.strict) {
        throw err;
      }
      errors.push({ dir, message });
    }
  }

  return { skills, errors };
}
