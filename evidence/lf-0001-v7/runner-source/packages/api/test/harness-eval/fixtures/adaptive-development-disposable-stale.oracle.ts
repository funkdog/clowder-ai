import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const candidateRoot = '$CANDIDATE_ROOT';
const require = createRequire(join(candidateRoot, 'packages/api/package.json'));
const Fastify = require('fastify');
const { ThreadStore } = await import(
  `${candidateRoot}/packages/api/dist/domains/cats/services/stores/ports/ThreadStore.js`
);
const { threadsRoutes } = await import(`${candidateRoot}/packages/api/dist/routes/threads.js`);
const root = mkdtempSync(join(process.env.TMPDIR as string, 'persistent-stale-'));
const runtimeRoot = join(root, 'runtime');
const workspaceRoot = join(root, 'workspace');
const stalePath = join(runtimeRoot, 'missing-project');
mkdirSync(runtimeRoot, { recursive: true });
mkdirSync(workspaceRoot, { recursive: true });
process.env.CAT_CAFE_RUNTIME_ROOT = runtimeRoot;
process.env.CAT_CAFE_WORKSPACE_ROOT = workspaceRoot;
const app = Fastify();
const threadStore = new ThreadStore();

try {
  await app.register(threadsRoutes, { threadStore });
  await app.ready();
  const listSeed = threadStore.create('alice', 'Stale list', stalePath);
  const listResponse = await app.inject({
    method: 'GET',
    url: '/api/threads',
    headers: { 'x-cat-cafe-user': 'alice' },
  });
  assert.equal(listResponse.statusCode, 200, listResponse.body);
  assert.equal(
    JSON.parse(listResponse.body).threads.find((thread: { id: string }) => thread.id === listSeed.id)?.projectPath,
    'default',
  );
  assert.equal((await threadStore.get(listSeed.id))?.projectPath, 'default');

  const detailSeed = threadStore.create('alice', 'Stale detail', stalePath);
  const detailResponse = await app.inject({ method: 'GET', url: `/api/threads/${detailSeed.id}` });
  assert.equal(detailResponse.statusCode, 200, detailResponse.body);
  assert.equal(JSON.parse(detailResponse.body).projectPath, 'default');
  assert.equal((await threadStore.get(detailSeed.id))?.projectPath, 'default');

  const trashSeed = threadStore.create('alice', 'Stale trash', stalePath);
  threadStore.softDelete(trashSeed.id);
  const trashResponse = await app.inject({
    method: 'GET',
    url: '/api/threads?deleted=true',
    headers: { 'x-cat-cafe-user': 'alice' },
  });
  assert.equal(trashResponse.statusCode, 200, trashResponse.body);
  assert.equal(
    JSON.parse(trashResponse.body).threads.find((thread: { id: string }) => thread.id === trashSeed.id)?.projectPath,
    'default',
  );
  assert.equal((await threadStore.get(trashSeed.id))?.projectPath, 'default');
} finally {
  await app.close();
  rmSync(root, { recursive: true, force: true });
}
