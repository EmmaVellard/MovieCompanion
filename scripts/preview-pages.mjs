import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'out');
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/MovieCompanion';
const port = Number(process.env.PORT ?? 4173);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function localFile(requestUrl) {
  const url = new URL(requestUrl ?? '/', `http://localhost:${port}`);
  if (!url.pathname.startsWith(basePath)) return null;
  const relative = decodeURIComponent(url.pathname.slice(basePath.length));
  const normalized = path.normalize(relative).replace(/^(\.\.[/\\])+/, '');
  let filename = path.join(outputDirectory, normalized);
  if (existsSync(filename) && statSync(filename).isDirectory()) {
    filename = path.join(filename, 'index.html');
  }
  if (!existsSync(filename) && !path.extname(filename)) {
    filename = path.join(outputDirectory, 'index.html');
  }
  return filename.startsWith(outputDirectory) ? filename : null;
}

createServer((request, response) => {
  const filename = localFile(request.url);
  if (!filename || !existsSync(filename) || statSync(filename).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-cache',
    'content-type':
      contentTypes[path.extname(filename)] ?? 'application/octet-stream',
  });
  createReadStream(filename).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(
    `Movie Companion Pages preview: http://localhost:${port}${basePath}/`,
  );
});
