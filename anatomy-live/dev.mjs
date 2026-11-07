import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import './build.mjs';
const { default: worker } = await import('./dist/server/index.js');
const port = Number(process.env.PORT ?? 4173);
createServer(async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const init = { method: req.method, headers: req.headers, signal: controller.signal };
  if (req.method !== 'GET' && req.method !== 'HEAD') Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' });
  try {
    const response = await worker.fetch(new Request('http://' + req.headers.host + req.url, init), process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch {
    res.writeHead(500);
    res.end('Preview request failed.');
  }
}).listen(port, '127.0.0.1', () => {
  console.log('Anatomy Live is running at http://127.0.0.1:' + port);
});
