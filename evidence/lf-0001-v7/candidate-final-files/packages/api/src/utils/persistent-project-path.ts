import { isAbsolute, relative, resolve, sep } from 'node:path';
import { validateProjectPath } from './project-path.js';

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Resolve a project path to storage that survives replacement of the runtime checkout.
 *
 * Runtime descendants are mapped lexically before validation so a descendant can be
 * recovered even after the disposable checkout has disappeared. The mapped persistent
 * directory must exist and pass the normal project-path policy; the runtime path is
 * never used as a fallback.
 */
export async function resolvePersistentProjectPath(projectPath: string): Promise<string | null> {
  const candidate = resolve(projectPath);
  const runtimeRootValue = process.env.CAT_CAFE_RUNTIME_ROOT?.trim();

  if (runtimeRootValue) {
    const runtimeRoot = resolve(runtimeRootValue);
    if (isWithin(runtimeRoot, candidate)) {
      const workspaceRootValue = process.env.CAT_CAFE_WORKSPACE_ROOT?.trim();
      if (!workspaceRootValue) return null;

      const workspaceRoot = resolve(workspaceRootValue);
      const mapped = resolve(workspaceRoot, relative(runtimeRoot, candidate));
      if (!isWithin(workspaceRoot, mapped)) return null;
      return validateProjectPath(mapped);
    }
  }

  return validateProjectPath(candidate);
}
