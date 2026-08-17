import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const candidateRoot = '$CANDIDATE_ROOT';
const require = createRequire(join(candidateRoot, 'packages/api/package.json'));
const Fastify = require('fastify');
const { ThreadStore } = await import(
  `${candidateRoot}/packages/api/dist/domains/cats/services/stores/ports/ThreadStore.js`
);
const { threadsRoutes } = await import(`${candidateRoot}/packages/api/dist/routes/threads.js`);
const root = mkdtempSync(join(process.env.TMPDIR as string, 'persistent-containment-'));
const runtimeRoot = join(root, 'runtime');
const workspaceRoot = join(root, 'workspace');
const runtimeChild = join(runtimeRoot, 'escape');
const workspaceChild = join(workspaceRoot, 'escape');
const external = join(root, 'external');
mkdirSync(runtimeChild, { recursive: true });
mkdirSync(workspaceRoot, { recursive: true });
mkdirSync(external, { recursive: true });
symlinkSync(external, workspaceChild, 'dir');
process.env.CAT_CAFE_RUNTIME_ROOT = runtimeRoot;
process.env.CAT_CAFE_WORKSPACE_ROOT = workspaceRoot;
const app = Fastify();
const threadStore = new ThreadStore();

try {
  await app.register(threadsRoutes, { threadStore });
  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/threads',
    payload: { userId: 'alice', title: 'Escaping project', projectPath: runtimeChild },
  });
  assert.ok(response.statusCode >= 400, response.body);
  const threads = await threadStore.list('alice');
  assert.equal(
    threads.some((thread: { projectPath?: string }) => thread.projectPath === external),
    false,
  );
} finally {
  await app.close();
  rmSync(root, { recursive: true, force: true });
}
