import assets from './assets.mjs';
import { preparedDrawing } from './ui/scenes.js';
import { technicalDrawing } from './ui/technical-scenes.js';
import { organicDrawing } from './ui/organic-scenes.js';

const model = 'anthropic/claude-haiku-5.5';
const system = `Illustrate the subject accurately, even if the input is one word or an unusual phrase. Output pipe-delimited drawing commands only, one per line, with no markdown, JSON, quotes, or conversation. An optional first check line can summarize what must be true; then draw immediately.
Choose the appropriate representation:
- For an ordered process or cycle, including biology or a mechanism changing over time, use step|short name|one action or state per step, in order (2 to 6). Start with step on the first visible line. Do not add a freeform title. Include every named stage. Use names without numerical prefixes. End a cycle with loop| to draw the return arrow.
- For messages between two entities, use actors|left name|right name, then message|right|name for left-to-right, or message|left|name for right-to-left. One message per line. Use the exact short message name with no numbering or parameter values. Include every named message in chronological order.
- For objects, physical systems, or a circuit, draw a simple 2D schematic using the primitives below. Select geometry that makes the mechanism clear. For physical arrows check origin, direction and what they act on. For circuits trace a continuous wire through each required component and return; draw connection dots only for real junctions and never run a wire through a component. For paired parts show both. A label alone is not a drawing of a part.
- If an unfamiliar physical detail is hard to draw accurately, simplify it or use the ordered steps. Avoid sketches that contradict their own labels. Keep any check line brief: check|key facts that the drawing must agree with. The check line is hidden. An optional note can state the central takeaway. Put all essential parts, states, and directions in the drawing itself.
For organic subjects, construct one recognizable, proportioned silhouette with smooth contour curves first. Attach smaller parts at their real joints or edges, then add interior anatomy and labels.
Primitive format on an 800x480 canvas:
line|x1|y1|x2|y2|color
arrow|x1|y1|x2|y2|color
box|x|y|width|height|color
circle|cx|cy|radius|color
poly|x1,y1 x2,y2 x3,y3|color
curve|x1|y1|controlX|controlY|x2|y2|color
path|M,100,200 C,150,100,250,100,300,200 L,100,200 Z|mint (filled, closed outline)
trace|M,100,200 C,150,100,250,100,300,200|mint (unfilled contour)
text|x|y|label|color
note|one sentence
Colors: ink, mint, violet, amber, muted. Coordinates inside x=65..735 and y=45..435. Center labels, keep them short (under 40 chars), and leave space around them. Draw about 8 to 25 primitives. Use symbols for unspecified quantities. Do not invent numbers or computed results. Example: arrow|200|240|490|240|mint followed by text|345|215|Flow|mint.`;

const schemas = { line: 6, arrow: 6, box: 6, circle: 5, poly: 3, path: 3, trace: 3, curve: 8, text: 5, note: 2 };
const colors = new Set(['ink', 'mint', 'violet', 'amber', 'muted']);
const pathLengths = { M: 3, L: 3, Q: 5, C: 7, Z: 1 };
const within = (value, limit) => Number.isFinite(value) && value >= 0 && value <= limit;

export function drawingCommand(row) {
  let item;
  try { item = JSON.parse(row); } catch { return null; }
  if (!Array.isArray(item) || !Object.hasOwn(schemas, item[0]) || schemas[item[0]] !== item.length) return null;
  const [kind, x, y, a, b] = item;
  if (kind === 'note') return typeof x === 'string' && x.length <= 200 ? item : null;
  if (!colors.has(item.at(-1))) return null;
  if (kind === 'path' || kind === 'trace') {
    if (!Array.isArray(x) || x.length < 2 || x.length > 34 || x[0]?.[0] !== 'M') return null;
    if (kind === 'path' && x.at(-1)?.[0] !== 'Z') return null;
    return x.every(segment => Array.isArray(segment) && Object.hasOwn(pathLengths, segment[0]) &&
      segment.length === pathLengths[segment[0]] &&
      segment.slice(1).every((value, index) => within(value, index % 2 ? 480 : 800))) ? item : null;
  }
  if (kind === 'poly') {
    return Array.isArray(x) && x.length >= 3 && x.length <= 14 &&
      x.every(p => Array.isArray(p) && p.length === 2 && within(p[0], 800) && within(p[1], 480)) ? item : null;
  }
  if (!within(x, 800) || !within(y, 480)) return null;
  if (kind === 'text') return typeof a === 'string' && a.length <= 70 ? item : null;
  if (kind === 'circle') return within(a, 240) && a > 0 ? item : null;
  if (kind === 'box') return within(a, 800 - x) && within(b, 480 - y) && a > 0 && b > 0 ? item : null;
  if (!within(a, 800) || !within(b, 480)) return null;
  return kind !== 'curve' || (within(item[5], 800) && within(item[6], 480)) ? item : null;
}

function modelCommand(row) {
  const fields = row.trim().split('|');
  const kind = fields[0];
  if (!Object.hasOwn(schemas, kind) || fields.length !== schemas[kind]) return null;
  if (kind === 'note') return drawingCommand(JSON.stringify(fields));
  const color = fields.pop().trim();
  const numeric = value => /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  let args;
  if (kind === 'poly') {
    args = [fields[1].trim().split(/\s+/).map(point => point.split(',').map(numeric))];
  } else if (kind === 'path' || kind === 'trace') {
    args = [fields[1].trim().split(/\s+/).map(part => {
      const [letter, ...coordinates] = part.split(',');
      return [letter, ...coordinates.map(numeric)];
    })];
  } else if (kind === 'text') {
    args = [numeric(fields[1]), numeric(fields[2]), fields[3].trim()];
  } else {
    args = fields.slice(1).map(numeric);
  }
  return drawingCommand(JSON.stringify([kind, ...args, color]));
}

function wrapLabel(text, width, maxLines = 2) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  while (words.length && lines.length < maxLines) {
    let line = words.shift();
    while (words.length && line.length + words[0].length + 1 <= width) line += ' ' + words.shift();
    lines.push(line.length > width ? line.slice(0, width - 1) + '…' : line);
  }
  if (words.length) {
    const last = lines.length - 1;
    lines[last] = lines[last].slice(0, width - 1).trimEnd() + '…';
  }
  return lines;
}

function layoutCommands(row, layout) {
  const parts = row.trim().split('|').map(part => part.trim());
  const [kind, a, b] = parts;
  if (kind === 'check') return [];
  if (kind === 'step' && a && b && (!layout.kind || layout.kind === 'steps') && !layout.loop && layout.count < 6) {
    const heading = a.replace(/^\d+[.): -]+/, '') || a;
    const key = heading.toLowerCase();
    if (layout.headings.has(key)) return [];
    layout.headings.add(key);
    layout.kind = 'steps';
    layout.leading = [];
    const index = layout.count++;
    const y = 31 + index * 70;
    const detail = wrapLabel(parts.slice(2).join(' '), 32);
    const commands = [
      ['box', 161, y, 478, 62, index % 2 ? 'violet' : 'mint'],
      ['text', 400, y + 14, wrapLabel(heading, 32, 1)[0], 'ink'],
      ...detail.map((text, i) => ['text', 400, y + (detail.length === 1 ? 42 : 34 + i * 19), text, 'muted'])
    ];
    if (index) commands.unshift(['arrow', 400, y - 8, 400, y - 1, 'muted']);
    return commands;
  }
  if (kind === 'loop' && parts.length <= 2 && !a && layout.kind === 'steps' && layout.count > 1 && !layout.loop) {
    layout.loop = true;
    const firstY = 62;
    const lastY = firstY + (layout.count - 1) * 70;
    return [
      ['line', 641, lastY, 680, lastY, 'amber'],
      ['line', 680, lastY, 680, firstY, 'amber'],
      ['arrow', 680, firstY, 641, firstY, 'amber']
    ];
  }
  if (kind === 'actors' && !layout.kind && parts.length === 3 && a && b && a !== b) {
    layout.kind = 'sequence';
    layout.leading = [];
    const actorLabel = (x, name) => {
      const lines = wrapLabel(name, 15);
      return lines.map((text, i) => ['text', x, lines.length === 1 ? 66 : 56 + i * 20, text, 'ink']);
    };
    return [
      ['box', 62, 40, 196, 52, 'mint'], ['box', 542, 40, 196, 52, 'violet'],
      ...actorLabel(160, a), ...actorLabel(640, b),
      ['line', 160, 92, 160, 427, 'muted'], ['line', 640, 92, 640, 427, 'muted']
    ];
  }
  if (kind === 'message' && layout.kind === 'sequence' && a && b &&
      (a === 'right' || a === 'left') && layout.count < 6) {
    const y = 143 + layout.count++ * 52;
    const right = a === 'right';
    const color = right ? 'mint' : 'violet';
    return [
      ['arrow', right ? 160 : 640, y, right ? 640 : 160, y, color],
      ['text', 400, y - 15, wrapLabel(parts.slice(2).join(' '), 38, 1)[0], color]
    ];
  }
  const command = modelCommand(row);
  if (!command || (layout.kind && layout.kind !== 'freeform' && command[0] !== 'note')) return [];
  if (!layout.kind && command[0] === 'text') {
    if (layout.leading.length < 6) layout.leading.push(command);
    return [];
  }
  if (!layout.kind && command[0] !== 'note') {
    layout.kind = 'freeform';
    return [...layout.leading, command];
  }
  return [command];
}

const streamHeaders = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store, no-transform'
};

function numberSafe(command, suppliedNumbers) {
  const label = command[0] === 'note' ? command[1] : command[0] === 'text' ? command[3] : null;
  const numbers = label?.match(/(?:\d+(?:\.\d+)?|\.\d+)/g) ?? [];
  if (!numbers.length) return true;
  if (/[=≈≠]/.test(label)) return false;
  return numbers.every(number => suppliedNumbers.has(Number(number)));
}

function safeDrawingCommand(command, suppliedNumbers) {
  if (numberSafe(command, suppliedNumbers)) return command;
  if (command[0] !== 'text') return null;
  const shortLabel = command[3].split('(')[0].trim();
  if (shortLabel === command[3] || !shortLabel) return null;
  const compact = [...command];
  compact[3] = shortLabel;
  return numberSafe(compact, suppliedNumbers) ? compact : null;
}

function needsReview(prompt, layout, commands) {
  return layout.kind === 'freeform' && commands.length >= 5 &&
    /\b(?:voltage|current|force|pressure|torque|vector|circuit|flow|steer\w*|geometry|beam|axis|algorithm|gradient|mechanism|schematic|gear\w*|lever|piston|wheel\w*|diagram)\b/i.test(prompt);
}

async function reviewSketch(prompt, commands, key, signal, suppliedNumbers) {
  const reviewPrompt = `Check the actual geometry of a technical diagram. Its drawing commands use screen coordinates: x increases right, y increases down, and each arrow goes from its first point to its second. Text labels do not fix a contradictory picture.
Look for an incorrect arrow, a missing connection or physical contact, a reversed relationship, or a diagram that doesn't show the claimed result. Compare the positions and endpoints directly. Ignore minor aesthetics. If the key relationship is present and correct, output exactly OK.
If the drawing is wrong or the core relationship is missing, replace it with two to five accurate, short stages or relationships in causal order. Output only lines in the format step|Name|Explanation, then note|one sentence. Keep each step detail under 55 characters. Include the requested outcome as the last step. Use symbolic labels and no invented numbers. No markdown or code.`;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5200)]),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 300, provider: { sort: 'latency' }, reasoning: { enabled: false },
        messages: [
          { role: 'system', content: reviewPrompt },
          { role: 'user', content: JSON.stringify({ subject: prompt, commands }) }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') return null;
    const verdict = choice?.message?.content?.trim();
    if (verdict === 'OK' || verdict === 'OK.') return { result: 'checked' };
    if (typeof verdict !== 'string' || verdict.length > 3000) return null;
    const replacementLayout = { count: 0, leading: [], headings: new Set() };
    const replacement = verdict.split(/\r?\n|\\n/).flatMap(row =>
      layoutCommands(row, replacementLayout).map(command => safeDrawingCommand(command, suppliedNumbers)).filter(Boolean));
    if (replacementLayout.kind !== 'steps' || replacementLayout.count < 2) return null;
    return { result: 'simplified', commands: replacement };
  } catch {
    return null;
  }
}

function error(message, status) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function draw(request, env) {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return error('Open the studio to draw here.', 403);
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return error('Send a JSON prompt.', 415);
  if (Number(request.headers.get('Content-Length')) > 4096) return error('Use a shorter prompt.', 413);
  let data;
  try { data = JSON.parse((await request.text()).slice(0, 4097)); } catch { return error('Enter a short drawing prompt.', 400); }
  const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
  if (!prompt || prompt.length > 360) return error('Enter a prompt of 1–360 characters.', 400);
  const organic = organicDrawing(prompt);
  const prepared = organic ?? preparedDrawing(prompt) ?? technicalDrawing(prompt);
  if (prepared) {
    const lines = prepared.map(command => JSON.stringify({ command }));
    lines.push(JSON.stringify({ done: true, source: organic ? 'illustrated' : 'calculated' }));
    return new Response(lines.join('\n') + '\n', { headers: streamHeaders });
  }
  const suppliedNumbers = new Set((prompt.match(/(?:\d+(?:\.\d+)?|\.\d+)/g) ?? []).map(Number));
  if (!env.OPENROUTER_API_KEY) return error('Live drawing is unavailable. Try a sample sketch.', 503);

  const upstreamAbort = new AbortController();
  const abort = () => upstreamAbort.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 25000);
  const cleanup = () => {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abort);
  };
  let upstream;
  try {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: upstreamAbort.signal,
      headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: true, max_tokens: 840, provider: { sort: 'latency' }, reasoning: { enabled: false },
        messages: [{ role: 'system', content: system }, { role: 'user', content: 'Subject to visualize:\n' + prompt }]
      })
    });
  } catch {
    cleanup();
    return error('Could not reach the drawing model. Try again.', 502);
  }
  if (!upstream.ok || !upstream.body) {
    cleanup();
    await upstream.body?.cancel().catch(() => {});
    if (upstream.status === 401 || upstream.status === 403) return error('OpenRouter rejected the connection credentials.', 502);
    if (upstream.status === 402) return error('The OpenRouter account has insufficient credits for this model.', 502);
    if (upstream.status === 429) return error('The drawing model is busy. Try again in a moment.', 429);
    return error('OpenRouter could not start the drawing.', 502);
  }

  const reader = upstream.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let canceled = false;
  const body = new ReadableStream({
    async start(controller) {
      let packet = '';
      let modelLine = '';
      let marks = 0;
      let finished = false;
      let shortened = false;
      let caption = null;
      let concluded = false;
      const layout = { count: 0, leading: [], headings: new Set() };
      const drawn = [];
      const emit = value => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
      const sendLine = row => {
        if (concluded) return;
        for (const candidate of layoutCommands(row, layout)) {
          if (marks >= 40) break;
          const command = safeDrawingCommand(candidate, suppliedNumbers);
          if (!command) continue;
          if (command[0] === 'note') {
            caption = command;
            concluded = marks > 0;
          } else {
            marks++;
            drawn.push(command);
            emit({ command });
          }
        }
      };
      const readEvent = line => {
        if (!line.startsWith('data:')) return;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { finished = true; return; }
        let event;
        try { event = JSON.parse(payload); } catch { return; }
        if (event.error) throw Error('Upstream error');
        if (event.choices?.[0]?.finish_reason === 'length') shortened = true;
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta !== 'string') return;
        modelLine += delta;
        if (modelLine.length > 12000) throw Error('Oversized command');
        const lines = modelLine.split(/\r?\n|\\n/);
        modelLine = lines.pop();
        for (const row of lines) sendLine(row);
      };
      try {
        while (!finished && !canceled && !concluded && marks < 40) {
          const chunk = await reader.read();
          if (chunk.done) break;
          packet += decoder.decode(chunk.value, { stream: true });
          if (packet.length > 100000) throw Error('Oversized stream event');
          const lines = packet.split('\n');
          packet = lines.pop();
          for (const line of lines) readEvent(line);
        }
        if (canceled) return;
        if (packet.trim()) readEvent(packet);
        if (modelLine.trim()) sendLine(modelLine);
        const incompleteLayout = layout.kind === 'sequence' ? layout.count < 1 : layout.kind === 'steps' && layout.count < 2;
        if (!layout.kind || !marks || incompleteLayout) emit({ error: 'The model returned no usable drawing. Try a simpler prompt.' });
        else {
          if (caption) emit({ command: caption });
          let reviewed;
          const reviewing = needsReview(prompt, layout, drawn);
          if (reviewing) {
            emit({ reviewing: true });
            await reader.cancel().catch(() => {});
            reviewed = await reviewSketch(prompt, drawn, env.OPENROUTER_API_KEY, upstreamAbort.signal, suppliedNumbers);
            if (canceled) return;
            if (reviewed?.commands) emit({ replacement: reviewed.commands });
          }
          emit({ done: true, partial: !reviewed?.commands && (shortened || marks >= 40), review: reviewed?.result ?? (reviewing ? 'unavailable' : undefined) });
        }
      } catch {
        if (!canceled) emit({ error: marks ? 'The stream stopped early. The drawing shown is partial.' : 'The drawing stream stopped. Try again.' });
      } finally {
        cleanup();
        await reader.cancel().catch(() => {});
        if (!canceled) controller.close();
      }
    },
    cancel() { canceled = true; abort(); cleanup(); }
  });
  return new Response(body, { headers: streamHeaders });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/draw' && request.method === 'POST') return draw(request, env);
    const index = ['/', '/app.js', '/style.css', '/scenes.js'].indexOf(path);
    if (index < 0 || request.method !== 'GET') return error('Page not found.', 404);
    return new Response(assets[index], { headers: {
      'Content-Type': ['text/html', 'text/javascript', 'text/css', 'text/javascript'][index] + '; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"
    } });
  }
};
