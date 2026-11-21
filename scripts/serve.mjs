import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/src/styles.css', ['src/styles.css', 'text/css']],
  ['/src/app.mjs', ['src/app.mjs', 'text/javascript']],
  ['/src/calendar.mjs', ['src/calendar.mjs', 'text/javascript']],
  ['/src/catalog.mjs', ['src/catalog.mjs', 'text/javascript']],
  ['/src/scheduler.mjs', ['src/scheduler.mjs', 'text/javascript']],
]);
const root = new URL('../', import.meta.url);
const port = Number(process.env.PORT ?? 4173);

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const route = request.url.split('?')[0];
  const file = files.get(route);
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado.');
    return;
  }

  try {
    const [path, type] = file;
    const content = await readFile(new URL(path, root));
    response.writeHead(200, {
      'Content-Type': `${type}; charset=utf-8`,
      'Content-Length': content.byteLength,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Erro ao ler o arquivo.');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Grade Clara disponível em http://127.0.0.1:${server.address().port}`);
});
