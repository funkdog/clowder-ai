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
const root = mkdtempSync(join(process.env.TMPDIR as string, 'persistent-remap-'));
const runtimeRoot = join(root, 'runtime');
const workspaceRoot = join(root, 'workspace');
const runtimeChild = join(runtimeRoot, 'projects', 'alpha');
const workspaceChild = join(workspaceRoot, 'projects', 'alpha');
mkdirSync(runtimeChild, { recursive: true });
mkdirSync(workspaceChild, { recursive: true });
process.env.CAT_CAFE_RUNTIME_ROOT = runtimeRoot;
process.env.CAT_CAFE_WORKSPACE_ROOT = workspaceRoot;
const app = Fastify();
const threadStore = new ThreadStore();

try {
  await app.register(threadsRoutes, { threadStore });
  await app.ready();
  for (const [inputPath, expectedPath] of [
    [runtimeRoot, realpathSync(workspaceRoot)],
    [runtimeChild, realpathSync(workspaceChild)],
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/threads',
      payload: { userId: 'alice', title: `Create ${inputPath}`, projectPath: inputPath },
    });
    assert.equal(response.statusCode, 201, response.body);
    const created = JSON.parse(response.body);
    assert.equal(created.projectPath, expectedPath);
    assert.equal((await threadStore.get(created.id))?.projectPath, expectedPath);
  }

  const listedSeed = threadStore.create('alice', 'List migration', runtimeRoot);
  const listResponse = await app.inject({
    method: 'GET',
    url: '/api/threads',
    headers: { 'x-cat-cafe-user': 'alice' },
  });
  assert.equal(listResponse.statusCode, 200, listResponse.body);
  assert.equal(
    JSON.parse(listResponse.body).threads.find((thread: { id: string }) => thread.id === listedSeed.id)?.projectPath,
    realpathSync(workspaceRoot),
  );
  assert.equal((await threadStore.get(listedSeed.id))?.projectPath, realpathSync(workspaceRoot));

  const detailSeed = threadStore.create('alice', 'Detail migration', runtimeRoot);
  const detailResponse = await app.inject({ method: 'GET', url: `/api/threads/${detailSeed.id}` });
  assert.equal(detailResponse.statusCode, 200, detailResponse.body);
  assert.equal(JSON.parse(detailResponse.body).projectPath, realpathSync(workspaceRoot));
  assert.equal((await threadStore.get(detailSeed.id))?.projectPath, realpathSync(workspaceRoot));

  const trashSeed = threadStore.create('alice', 'Trash migration', runtimeRoot);
  threadStore.softDelete(trashSeed.id);
  const trashResponse = await app.inject({
    method: 'GET',
    url: '/api/threads?deleted=true',
    headers: { 'x-cat-cafe-user': 'alice' },
  });
  assert.equal(trashResponse.statusCode, 200, trashResponse.body);
  assert.equal(
    JSON.parse(trashResponse.body).threads.find((thread: { id: string }) => thread.id === trashSeed.id)?.projectPath,
    realpathSync(workspaceRoot),
  );
  assert.equal((await threadStore.get(trashSeed.id))?.projectPath, realpathSync(workspaceRoot));
} finally {
  await app.close();
  rmSync(root, { recursive: true, force: true });
}
