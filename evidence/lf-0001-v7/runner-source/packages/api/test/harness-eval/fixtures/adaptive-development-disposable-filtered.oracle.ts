import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const candidateRoot = '$CANDIDATE_ROOT';
const require = createRequire(join(candidateRoot, 'packages/api/package.json'));
const Fastify = require('fastify');
const { ThreadStore } = await import(
  `${candidateRoot}/packages/api/dist/domains/cats/services/stores/ports/ThreadStore.js`
);
const { threadsRoutes } = await import(`${candidateRoot}/packages/api/dist/routes/threads.js`);
const root = mkdtempSync(join(process.env.TMPDIR as string, 'persistent-filter-'));
const runtimeRoot = join(root, 'runtime');
const workspaceRoot = join(root, 'workspace');
const unrelatedStalePath = join(runtimeRoot, 'unrelated-missing');
mkdirSync(runtimeRoot, { recursive: true });
mkdirSync(workspaceRoot, { recursive: true });
process.env.CAT_CAFE_RUNTIME_ROOT = runtimeRoot;
process.env.CAT_CAFE_WORKSPACE_ROOT = workspaceRoot;
const app = Fastify();
const threadStore = new ThreadStore();

try {
  await app.register(threadsRoutes, { threadStore });
  await app.ready();
  const matching = threadStore.create('alice', 'Matching legacy record', runtimeRoot);
  const unrelated = threadStore.create('alice', 'Unrelated stale record', unrelatedStalePath);
  const response = await app.inject({
    method: 'GET',
    url: `/api/threads?projectPath=${encodeURIComponent(runtimeRoot)}`,
    headers: { 'x-cat-cafe-user': 'alice' },
  });
  assert.equal(response.statusCode, 200, response.body);
  const ids = JSON.parse(response.body).threads.map((thread: { id: string }) => thread.id);
  assert.ok(ids.includes(matching.id));
  assert.equal(ids.includes(unrelated.id), false);
  assert.equal((await threadStore.get(matching.id))?.projectPath, realpathSync(workspaceRoot));
  assert.equal((await threadStore.get(unrelated.id))?.projectPath, unrelatedStalePath);
} finally {
  await app.close();
  rmSync(root, { recursive: true, force: true });
}
