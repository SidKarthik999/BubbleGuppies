import { mkdir, readFile, writeFile } from 'node:fs/promises';

const files = await Promise.all(['index.html', 'app.js', 'style.css', 'scenes.js'].map(name => readFile('ui/' + name, 'utf8')));
const server = await readFile('server.mjs', 'utf8');
const scenes = files[3].replace(/^export /gm, '');
const technicalScenes = (await readFile('ui/technical-scenes.js', 'utf8')).replace(/^export /gm, '');
const organicScenes = (await readFile('ui/organic-scenes.js', 'utf8')).replace(/^export /gm, '');
const bundle = server
  .replace("import assets from './assets.mjs';", () => 'const assets = ' + JSON.stringify(files) + ';')
  .replace("import { preparedDrawing } from './ui/scenes.js';", () => scenes)
  .replace("import { technicalDrawing } from './ui/technical-scenes.js';", () => technicalScenes)
  .replace("import { organicDrawing } from './ui/organic-scenes.js';", () => organicScenes);
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js', bundle);
