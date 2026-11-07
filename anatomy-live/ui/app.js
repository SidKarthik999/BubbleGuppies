import { rightTriangle } from '/scenes.js';

const canvas = document.querySelector('#canvas');
const form = document.querySelector('#prompt-form');
const input = document.querySelector('#prompt');
const draw = document.querySelector('#draw');
const stop = document.querySelector('#stop');
const title = document.querySelector('#drawing-title');
const mode = document.querySelector('#mode');
const status = document.querySelector('#status');
const timing = document.querySelector('#timing');
const takeaway = document.querySelector('#takeaway');
const board = document.querySelector('.board');
const ns = 'http://www.w3.org/2000/svg';

const samples = {
  pythagorean: {
    title: 'Pythagorean theorem',
    prompt: 'Show the Pythagorean theorem with squares on all three sides of a 3–4–5 triangle.',
    commands: rightTriangle(3, 4, { example: true })
  },
  torque: {
    title: 'Torque lever',
    prompt: 'Draw a lever and show why pushing farther from the pivot creates more torque.',
    commands: [
      ['poly', [[252, 243], [202, 339], [302, 339]], 'muted'],
      ['box', 126, 215, 536, 28, 'mint'],
      ['circle', 252, 229, 9, 'ink'],
      ['arrow', 420, 103, 420, 209, 'violet'],
      ['arrow', 625, 103, 625, 209, 'amber'],
      ['text', 420, 77, 'Same force', 'violet'],
      ['text', 625, 77, 'Same force', 'amber'],
      ['text', 250, 372, 'Pivot', 'ink'],
      ['line', 267, 277, 420, 277, 'violet'],
      ['line', 267, 316, 625, 316, 'amber'],
      ['text', 465, 351, 'Longer lever arm', 'amber'],
      ['note', 'For the same perpendicular force, the longer lever arm gives more torque.']
    ]
  },
  flow: {
    title: 'Water cycle',
    prompt: 'Draw a simple water cycle diagram with evaporation, condensation, precipitation, and collection.',
    commands: [
      ['box', 115, 85, 220, 72, 'mint'], ['box', 465, 85, 220, 72, 'violet'],
      ['box', 465, 325, 220, 72, 'mint'], ['box', 115, 325, 220, 72, 'violet'],
      ['arrow', 348, 121, 452, 121, 'ink'], ['arrow', 575, 170, 575, 310, 'ink'],
      ['arrow', 450, 361, 348, 361, 'ink'], ['arrow', 225, 310, 225, 171, 'ink'],
      ['text', 225, 121, 'Evaporation', 'ink'], ['text', 575, 121, 'Condensation', 'ink'],
      ['text', 575, 361, 'Precipitation', 'ink'], ['text', 225, 361, 'Collection', 'ink'],
      ['note', 'Water moves between the surface and the atmosphere in a repeating cycle.']
    ]
  }
};

function svg(tag, attrs) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function render(command) {
  const [type, x, y, a, b, c, d] = command;
  if (type === 'note') {
    takeaway.textContent = x;
    return false;
  }
  const color = 'var(--' + command.at(-1) + ')';
  const stroke = { stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const surface = { ...stroke, fill: color, 'fill-opacity': 0.12 };
  let node;
  switch (type) {
    case 'line':
      node = svg('line', { ...stroke, x1: x, y1: y, x2: a, y2: b });
      break;
    case 'arrow': {
      const theta = Math.atan2(b - y, a - x);
      const back = angle => [a - 12 * Math.cos(theta + angle), b - 12 * Math.sin(theta + angle)];
      const head = [back(-0.48), [a, b], back(0.48)].map(point => point.join(',')).join(' ');
      node = svg('g', {});
      node.append(svg('line', { ...stroke, x1: x, y1: y, x2: a, y2: b }),
        svg('polyline', { ...stroke, points: head, fill: 'none' }));
      break;
    }
    case 'box':
      node = svg('rect', { ...surface, x, y, width: a, height: b, rx: 0 });
      break;
    case 'circle':
      node = svg('circle', { ...surface, cx: x, cy: y, r: a });
      break;
    case 'ellipse':
      node = svg('ellipse', { ...stroke, cx: x, cy: y, rx: a, ry: b, fill: 'none' });
      break;
    case 'poly':
      node = svg('polygon', { ...surface, points: x.map(point => point.join(',')).join(' ') });
      break;
    case 'path':
    case 'trace':
      node = svg('path', {
        ...(type === 'path' ? surface : { ...stroke, fill: 'none', 'stroke-width': 1.7 }),
        d: x.map(segment => segment.join(' ')).join(' ')
      });
      break;
    case 'curve':
      node = svg('path', { ...stroke, fill: 'none', d: 'M ' + x + ' ' + y + ' Q ' + a + ' ' + b + ' ' + c + ' ' + d });
      break;
    case 'text':
      node = svg('text', { x, y, fill: color, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      node.textContent = a;
      break;
    default:
      return false;
  }
  node.classList.add('mark');
  canvas.append(node);
  return true;
}

let active = null;

function setBusy(busy) {
  draw.disabled = busy;
  stop.hidden = !busy;
  board.setAttribute('aria-busy', String(busy));
}

function showSample(id, fillPrompt = true) {
  active?.abort();
  active = null;
  setBusy(false);
  const sample = samples[id];
  if (fillPrompt) input.value = sample.prompt;
  title.textContent = sample.title;
  canvas.setAttribute('aria-label', sample.title);
  mode.textContent = 'Sample sketch';
  canvas.replaceChildren();
  sample.commands.forEach(render);
  status.textContent = 'Sample ready';
  timing.textContent = '';
}

document.querySelectorAll('[data-sample]').forEach(button => {
  button.addEventListener('click', () => showSample(button.dataset.sample));
});
stop.addEventListener('click', () => active?.abort());

form.addEventListener('submit', async event => {
  event.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || active) return;
  const controller = new AbortController();
  active = controller;
  const started = performance.now();
  setBusy(true);
  mode.textContent = 'Live sketch';
  status.textContent = 'Waiting for the first stroke…';
  timing.textContent = '';
  let markCount = 0;
  let completed = false;
  try {
    const response = await fetch('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw Error(details.error ?? 'The drawing request failed. Try again.');
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = '';
    while (true) {
      const { value, done } = await reader.read();
      if (active !== controller) return;
      if (done) break;
      pending += value;
      const rows = pending.split('\n');
      pending = rows.pop();
      for (const row of rows) {
        if (!row) continue;
        const event = JSON.parse(row);
        if (event.error) throw Error(event.error);
        if (event.reviewing) status.textContent = 'Checking relationships…';
        if (event.replacement) {
          canvas.replaceChildren();
          takeaway.textContent = '';
          event.replacement.forEach(render);
        }
        if (event.done) {
          completed = true;
          if (event.source === 'calculated') mode.textContent = 'Checked layout';
          if (event.source === 'illustrated') mode.textContent = 'Anatomy illustration';
          if (event.review === 'simplified') mode.textContent = 'Simplified sketch';
          if (event.review === 'unavailable') mode.textContent = 'Unreviewed sketch';
          status.textContent = event.partial ? 'Drawing reached its size limit' : 'Drawing complete';
        }
        if (!event.command) continue;
        if (!markCount && event.command[0] !== 'note') {
          title.textContent = prompt;
          canvas.setAttribute('aria-label', prompt);
          canvas.replaceChildren();
          takeaway.textContent = '';
          timing.textContent = 'First stroke ' + ((performance.now() - started) / 1000).toFixed(2) + ' s';
          status.textContent = 'Drawing…';
        }
        if (render(event.command)) markCount++;
      }
    }
    if (!completed) throw Error('The stream ended before the drawing finished.');
  } catch (error) {
    if (active !== controller) return;
    status.textContent = controller.signal.aborted ? 'Drawing stopped' : error.message;
    if (!markCount) mode.textContent = 'Previous sketch';
  } finally {
    if (active === controller) {
      active = null;
      setBusy(false);
    }
  }
});

showSample('pythagorean', false);
