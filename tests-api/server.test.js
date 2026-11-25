import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApiServer } from '../backend/server.js';

const server = createApiServer();
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('GET /api/seed-data returns the current frontend seed JSON', async () => {
  const response = await fetch(baseUrl + '/api/seed-data');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /application\/json/i);
  const actual = await response.json();
  const expected = JSON.parse(await readFile(new URL('../public/assets/seed-data.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, expected);
});

test('seed API rejects methods other than GET', async () => {
  const response = await fetch(baseUrl + '/api/seed-data', { method: 'POST' });
  assert.equal(response.status, 405);
  assert.match(response.headers.get('allow') || '', /GET/i);
});

test('unknown API paths return JSON 404', async () => {
  const response = await fetch(baseUrl + '/api/not-a-route');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'Not found');
});
