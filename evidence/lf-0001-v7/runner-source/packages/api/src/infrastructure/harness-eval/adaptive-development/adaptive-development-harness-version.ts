import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function resolveAdaptiveDevelopmentHarnessVersion(repoRoot: string): string | undefined {
  const skillPath = join(repoRoot, 'cat-cafe-skills', 'adaptive-development-sop', 'SKILL.md');
  if (!existsSync(skillPath)) return undefined;
  try {
    const implementationRoots = [
      join(repoRoot, 'packages', 'api', 'src', 'infrastructure', 'harness-eval', 'adaptive-development'),
      join(repoRoot, 'packages', 'api', 'src', 'domains', 'work-ledger', 'evidence'),
    ];
    const implementationFiles = implementationRoots.flatMap((implementationRoot) =>
      existsSync(implementationRoot)
        ? readdirSync(implementationRoot)
            .filter((name) => name.endsWith('.ts'))
            .sort()
            .map((name) => join(implementationRoot, name))
        : [],
    );
    const files = [skillPath, ...implementationFiles];
    const hash = createHash('sha256');
    for (const path of files) {
      hash.update(path.slice(repoRoot.length));
      hash.update('\0');
      hash.update(readFileSync(path));
      hash.update('\0');
    }
    return `sha256:${hash.digest('hex')}`;
  } catch {
    return undefined;
  }
}
