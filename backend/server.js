import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const seedUrl = new URL('../public/assets/seed-data.json', import.meta.url);
const API_PATH = '/api/seed-data';

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

export function createApiServer(options = {}) {
  const source = options.seedPath || seedUrl;
  return createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (pathname !== API_PATH) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
      return;
    }
    try {
      const body = await readFile(source, 'utf8');
      JSON.parse(body);
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      sendJson(response, 500, { error: 'Unable to read seed data' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.BACKEND_PORT || 3001);
  const host = process.env.BACKEND_HOST || '127.0.0.1';
  const server = createApiServer();
  server.listen(port, host, () => {
    console.log('Seed API listening at http://' + host + ':' + port + API_PATH);
  });
}
