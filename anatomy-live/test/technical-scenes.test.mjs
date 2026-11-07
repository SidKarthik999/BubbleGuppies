import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../dist/server/index.js';
import { technicalDrawing } from '../ui/technical-scenes.js';

const labels = commands => commands.filter(c => c[0] === 'text').map(c => c[3]);
const arrowWith = (commands, color) => commands.find(c => c[0] === 'arrow' && c.at(-1) === color);
const vector = ([, x1, y1, x2, y2]) => [x2 - x1, y2 - y1];
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' vs ' + expected);

test('incline force directions track the actual ramp and the motion', () => {
  for (const downhill of [true, false]) {
    const commands = technicalDrawing('Free-body diagram of a block sliding ' + (downhill ? 'down' : 'up') + ' a 41-degree incline with kinetic friction');
    const [, [left, right]] = commands[0];
    const ramp = [right[0] - left[0], right[1] - left[1]];
    const normal = vector(arrowWith(commands, 'mint'));
    const gravity = vector(arrowWith(commands, 'violet'));
    const friction = vector(arrowWith(commands, 'amber'));
    approx(normal[0] * ramp[0] + normal[1] * ramp[1], 0);
    assert.ok(normal[1] < 0);
    assert.deepEqual(gravity, [0, 104]);
    approx(friction[0] * ramp[1] - friction[1] * ramp[0], 0);
    assert.equal(friction[0] > 0, downhill);
  }
  const noFriction = technicalDrawing('Free-body diagram of a block sliding down a 35-degree incline with no kinetic friction');
  assert.equal(arrowWith(noFriction, 'amber'), undefined);
});

test('gear diameters and arrows match tooth count and external meshing', () => {
  const commands = technicalDrawing('Two external gears with 15 and 45 teeth');
  const gears = commands.filter(c => c[0] === 'poly');
  assert.deepEqual(gears.map(c => c[1].length / 4), [15, 45]);
  const [a, b] = commands.filter(c => c[0] === 'circle');
  approx(gears[1][1][0][0] - b[1], (gears[0][1][0][0] - a[1]) * 3);
  const span = (gears[0][1][0][0] - a[1]) + (gears[1][1][0][0] - b[1]);
  approx(b[1] - a[1], span);
  assert.ok(vector(arrowWith(commands, 'mint'))[0] > 0);
  assert.ok(vector(arrowWith(commands, 'violet'))[0] < 0);
  assert.ok(labels(commands).includes('|ωA| / |ωB| = 3'));
});

test('equivalent resistance is calculated for both supported topologies', () => {
  for (const [topology, expected] of [['parallel', 2], ['series', 9]]) {
    const commands = technicalDrawing('Two resistors of 6 and 3 ohms in ' + topology + '. Show equivalent resistance.');
    assert.ok(labels(commands).includes('Equivalent resistance = ' + expected + ' Ω'));
    const symbols = commands.filter(c => c[0] === 'box');
    assert.equal(symbols.length, 2);
    assert.equal(symbols[0][1] === symbols[1][1], topology === 'parallel');
  }
});

test('orbital gravity points at the focus while velocity is tangent', () => {
  for (const where of ['perihelion', 'aphelion']) {
    const commands = technicalDrawing('Planet in elliptical orbit at ' + where);
    const [, cx, cy, a, b] = commands[0];
    const [, sunX, sunY] = commands[1];
    approx(sunX, cx - Math.sqrt(a * a - b * b));
    approx(sunY, cy);
    const gravity = arrowWith(commands, 'mint');
    const velocity = arrowWith(commands, 'violet');
    assert.equal(Math.sign(vector(gravity)[0]), Math.sign(sunX - gravity[1]));
    assert.equal(vector(gravity)[1], 0);
    assert.equal(vector(velocity)[0], 0);
  }
});

test('a streamed sequence renders the specified directions and keeps valid short labels', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const delta = 'actors|Client|Server\nmessage|right|SYN\nmessage|left|SYN-ACK (ack=x+1)\nmessage|right|ACK';
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: delta } }] }) + '\n\ndata: [DONE]\n\n');
  };
  try {
    const response = await worker.fetch(new Request('https://demo.test/api/draw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prompt":"TCP handshake"}'
    }), { OPENROUTER_API_KEY: 'fixture' });
    const events = (await response.text()).trim().split('\n').map(JSON.parse);
    const commands = events.flatMap(event => event.command ? [event.command] : []);
    assert.deepEqual(labels(commands), ['Client', 'Server', 'SYN', 'SYN-ACK', 'ACK']);
    assert.deepEqual(commands.filter(c => c[0] === 'arrow').map(c => Math.sign(vector(c)[0])), [1, -1, 1]);
    assert.equal(events.at(-1).done, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ordered layouts keep long step descriptions and ignore repeated stages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const lines = [
      'text|400|60|An explanatory title|ink',
      'step|1. Intake|The piston moves down while the intake valve stays open and fresh air enters the cylinder',
      'step|Intake|Duplicate stage',
      'step|Compression|The piston moves up with both valves shut',
      'note|A compression follows the intake.',
      'step|Extra|No extra stage after the takeaway'
    ];
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: lines.join('\n') } }] }) + '\n\ndata: [DONE]\n\n');
  };
  try {
    const response = await worker.fetch(new Request('https://demo.test/api/draw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prompt":"intake and compression"}'
    }), { OPENROUTER_API_KEY: 'fixture' });
    const events = (await response.text()).trim().split('\n').map(JSON.parse);
    const commands = events.flatMap(event => event.command ? [event.command] : []);
    assert.equal(commands.filter(command => command[0] === 'box').length, 2);
    assert.deepEqual(labels(commands).filter(label => ['Intake', 'Compression'].includes(label)), ['Intake', 'Compression']);
    assert.equal(commands.at(-1)[0], 'note');
    assert.equal(events.at(-1).done, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a technical sketch is visible before a successful review can replace it', async () => {
  const originalFetch = globalThis.fetch;
  let respondToReview;
  globalThis.fetch = async (_, init) => {
    const params = JSON.parse(init.body);
    if (!params.stream) {
      return new Promise(resolve => { respondToReview = resolve; });
    }
    const delta = 'line|100|100|200|100|ink\nline|100|130|200|130|ink\nline|100|160|200|160|ink\nline|100|190|200|190|ink\nline|100|220|200|220|ink';
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: delta } }] }) + '\n\ndata: [DONE]\n\n');
  };
  try {
    const response = await worker.fetch(new Request('https://demo.test/api/draw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prompt":"Hydraulic force diagram"}'
    }), { OPENROUTER_API_KEY: 'fixture' });
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    assert.ok(JSON.parse((await reader.read()).value).command);
    for (let i = 0; i < 4; i++) await reader.read();
    assert.equal(JSON.parse((await reader.read()).value).reviewing, true);
    respondToReview(Response.json({ choices: [{ message: { content: 'step|Input|Small piston presses fluid\nstep|Output|Fluid pushes the larger piston' } }] }));
    assert.ok(JSON.parse((await reader.read()).value).replacement.length > 3);
    assert.equal(JSON.parse((await reader.read()).value).review, 'simplified');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('left and right Ackermann turns put both steering axes on the rear axle line', () => {
  for (const side of ['left', 'right']) {
    const commands = technicalDrawing('Ackermann steering geometry in a ' + side + ' turn');
    const [center, innerAxis, outerAxis] = [commands[8], commands[2], commands[3]];
    assert.equal(center[0], 'circle');
    assert.equal(center[2], commands[1][2]);
    assert.equal(center[1] < 400, side === 'left');
    for (const axis of [innerAxis, outerAxis]) {
      assert.deepEqual(axis.slice(1, 3), center.slice(1, 3));
    }
    const [innerWheel, outerWheel] = commands.slice(4, 6);
    for (const [axis, wheel] of [[innerAxis, innerWheel], [outerAxis, outerWheel]]) {
      const [dx, dy] = vector(axis);
      const [p, q] = wheel[1];
      approx(dx * (q[0] - p[0]) + dy * (q[1] - p[1]), 0);
    }
    assert.ok(Math.abs(vector(innerAxis)[0]) < Math.abs(vector(outerAxis)[0]));
  }
});

test('organic drawings render without inference and contain valid curved silhouettes', async () => {
  const { drawingCommand } = await import('../dist/server/index.js');
  for (const [prompt, labelsExpected] of [
    ['hand anatomy', ['Thumb', 'Index', 'Middle', 'Ring', 'Little finger']],
    ['hand bones', ['Phalanges', 'Metacarpals', 'Carpals']],
    ['jellyfish anatomy', ['Bell', 'Tentacles', 'Oral arms']]
  ]) {
    const response = await worker.fetch(new Request('https://demo.test/api/draw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt })
    }), {});
    const events = (await response.text()).trim().split('\n').map(JSON.parse);
    const commands = events.flatMap(event => event.command ? [event.command] : []);
    assert.equal(events.at(-1).source, 'illustrated');
    for (const expected of labelsExpected) assert.ok(labels(commands).includes(expected));
    const curves = commands.filter(command => ['path', 'trace'].includes(command[0]));
    assert.ok(curves.some(command => command[0] === 'path'));
    assert.ok(curves.every(command => drawingCommand(JSON.stringify(command))));
  }
  assert.equal(drawingCommand('["path",[["M",10,10],["C",12,12,20,20,900,28],["Z"]],"mint"]'), null);
  assert.equal(drawingCommand('["path",[["M",10,10],["L",20,20]],"mint"]'), null);
});

test('a novel subject can stream bounded curves as drawing commands', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const delta = 'path|M,100,200 C,120,130,250,120,300,200 L,100,200 Z|mint\ntrace|M,110,210 Q,140,280,160,320|violet';
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: delta } }] }) + '\n\ndata: [DONE]\n\n');
  };
  try {
    const response = await worker.fetch(new Request('https://demo.test/api/draw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prompt":"sea creature silhouette"}'
    }), { OPENROUTER_API_KEY: 'fixture' });
    const events = (await response.text()).trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.flatMap(event => event.command ? [event.command[0]] : []), ['path', 'trace']);
    assert.equal(events.at(-1).done, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
