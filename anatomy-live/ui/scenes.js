const numberFormat = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 6,
  useGrouping: false
});

function measurement(value) {
  const text = numberFormat.format(value);
  return [Math.abs(Number(text) - value) <= Math.abs(value) * 1e-12 ? '=' : '≈', text];
}

export function rightTriangle(a, b, { example = false, statedHypotenuse, unit = '' } = {}) {
  const c = Math.hypot(a, b);
  const [cSign, cText] = measurement(c);
  const cSquared = a * a + b * b;
  const x = b * b / c;
  const h = a * b / c;
  const tip = [x, h];
  const left = [0, 0];
  const right = [c, 0];

  function square(start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    return [start, end, [end[0] - dy, end[1] + dx], [start[0] - dy, start[1] + dx]];
  }

  const squares = [square(tip, right), square(left, tip), square(left, right).map(([px, py]) => [px, -py])];
  const points = squares.flat();
  const minX = Math.min(...points.map(point => point[0]));
  const maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1]));
  const maxY = Math.max(...points.map(point => point[1]));
  const scale = Math.min(640 / (maxX - minX), 310 / (maxY - minY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const project = ([px, py]) => [400 + (px - centerX) * scale, 193 - (py - centerY) * scale];

  const legA = [(right[0] - tip[0]) / a, -tip[1] / a];
  const legB = [-tip[0] / b, -tip[1] / b];
  const markerSize = Math.min(11 / scale, a / 3, b / 3);
  const marker = (u, v) => project([
    tip[0] + markerSize * (u * legA[0] + v * legB[0]),
    tip[1] + markerSize * (u * legA[1] + v * legB[1])
  ]);
  const withUnit = (value, suffix) => measurement(value).join(' ') + (unit ? ' ' + unit + suffix : '');
  const areaLabel = (symbol, value) => symbol + '² ' + withUnit(value, '²');
  const squareLabels = squares.flatMap((points, index) => {
    const side = [a, b, c][index];
    if (side * scale < 45) return [];
    const center = points.reduce(([x, y], [px, py]) => [x + px / 4, y + py / 4], [0, 0]);
    return [['text', ...project(center), ['a²', 'b²', 'c²'][index], ['mint', 'violet', 'amber'][index]]];
  });
  const note = statedHypotenuse !== undefined && Math.abs(c - statedHypotenuse) / c > 1e-9
    ? 'With these legs, c ' + cSign + ' ' + cText + '. The supplied third side does not make a right triangle.'
    : (example ? 'Example with legs 3 and 4. ' : '') + 'The areas of the two leg squares add up to the area of the hypotenuse square.';

  return [
    ['poly', squares[0].map(project), 'mint'],
    ['poly', squares[1].map(project), 'violet'],
    ['poly', squares[2].map(project), 'amber'],
    ['poly', [left, right, tip].map(project), 'ink'],
    ['line', ...marker(1, 0), ...marker(1, 1), 'ink'],
    ['line', ...marker(1, 1), ...marker(0, 1), 'ink'],
    ...squareLabels,
    ['text', 135, 382, 'a ' + withUnit(a, ''), 'mint'],
    ['text', 400, 382, 'b ' + withUnit(b, ''), 'violet'],
    ['text', 665, 382, 'c ' + withUnit(c, ''), 'amber'],
    ['text', 135, 414, areaLabel('a', a * a), 'mint'],
    ['text', 400, 414, areaLabel('b', b * b), 'violet'],
    ['text', 665, 414, areaLabel('c', cSquared), 'amber'],
    ['note', note]
  ];
}

function torque(force, distance, degrees, assumedAngle, downward) {
  const theta = degrees * Math.PI / 180;
  const [sign, magnitude] = measurement(degrees === 180 ? 0 : force * distance * Math.sin(theta));
  const arrowX = 545 + Math.cos(theta) * 125;
  const arrowY = 249 + (downward ? 1 : -1) * Math.sin(theta) * 125;
  const placeLabelAbove = degrees > 20 && degrees < 160;
  return [
    ['box', 150, 238, 490, 23, 'mint'],
    ['poly', [[220, 261], [177, 332], [263, 332]], 'muted'],
    ['circle', 220, 249, 8, 'ink'],
    ['text', 220, 357, 'Pivot', 'ink'],
    ['circle', 545, 249, 5, 'amber'],
    ['arrow', 545, 249, arrowX, arrowY, 'amber'],
    ['text', downward ? arrowX + 68 : placeLabelAbove ? arrowX : 545,
      downward ? arrowY - 18 : placeLabelAbove ? arrowY - 22 : 185,
      'F = ' + numberFormat.format(force) + ' N', 'amber'],
    ['line', 220, 293, 545, 293, 'violet'],
    ['line', 220, 285, 220, 301, 'violet'],
    ['line', 545, 285, 545, 301, 'violet'],
    ['text', 382, 322, 'r = ' + numberFormat.format(distance) + ' m', 'violet'],
    ['text', 400, 415, '|τ| ' + sign + ' ' + magnitude + ' N·m', 'ink'],
    ['note', (assumedAngle ? 'Assuming a perpendicular force. ' : 'Force angle from the lever: ' + numberFormat.format(degrees) + '°. ') +
      'Torque magnitude is rF sin θ.']
  ];
}

const positive = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const negative = /(?:^|[\s=:,(])[-−]\d/u;
const validSide = value => Number.isFinite(value) && value >= 0.001 && value <= 1000000;

export function preparedDrawing(prompt) {
  const topic = prompt.toLowerCase();
  if (negative.test(topic)) return null;
  if (/\b(?:pythagore\w*|right[ -]triangle)\b/.test(topic)) {
    if (!/\d/.test(topic)) return rightTriangle(3, 4, { example: true });
    const triple = topic.match(new RegExp(positive + '[–—-]' + positive + '[–—-]' + positive));
    const namedA = topic.match(new RegExp(String.raw`\ba\s*=\s*` + positive));
    const namedB = topic.match(new RegExp(String.raw`\bb\s*=\s*` + positive));
    const unit = String.raw`(?:(mm|cm|km|in|ft|yd|m)\b)?`;
    const legPair = topic.match(new RegExp(String.raw`\b(?:legs?\s*(?:of|are|=|:)?|for|with)\s*` + positive + String.raw`\s*` + unit + String.raw`\s*(?:and|,)\s*` + positive + String.raw`\s*` + unit));
    const namedC = topic.match(new RegExp(String.raw`\bc\s*=\s*` + positive));
    const pair = triple?.slice(1, 3) ?? (namedA && namedB ? [namedA[1], namedB[1]] : (legPair ? [legPair[1], legPair[3]] : null));
    if (!pair || (legPair?.[2] && legPair?.[4] && legPair[2] !== legPair[4])) return null;
    const [a, b] = pair.map(Number);
    if (!validSide(a) || !validSide(b) || Math.max(a, b) / Math.min(a, b) > 40) return null;
    const statedHypotenuse = triple ? Number(triple[3]) : namedC ? Number(namedC[1]) : undefined;
    return rightTriangle(a, b, { statedHypotenuse, unit: legPair?.[2] ?? legPair?.[4] ?? '' });
  }
  if (/\btorque\b/.test(topic)) {
    const forces = [...topic.matchAll(new RegExp(positive + String.raw`\s*(?:n|newtons?)\b(?!\s*(?:[·⋅*]\s*m|[- ]met(?:er|re)))`, 'g'))];
    const distances = [...topic.matchAll(new RegExp(positive + String.raw`\s*(m|cm|mm|metres?|meters?)\b`, 'g'))];
    const angles = [...topic.matchAll(new RegExp(positive + String.raw`\s*(?:°|degrees?\b)`, 'g'))];
    if (forces.length !== 1 || distances.length !== 1 || angles.length > 1) return null;
    const force = Number(forces[0][1]);
    const [ , distanceValue, unit] = distances[0];
    const distance = Number(distanceValue) / ({ cm: 100, mm: 1000 }[unit] ?? 1);
    const degrees = angles.length ? Number(angles[0][1]) : 90;
    const numericValues = topic.match(/(?:\d+(?:\.\d+)?|\.\d+)/g) ?? [];
    if (numericValues.length !== forces.length + distances.length + angles.length) return null;
    if (!angles.length && /\b(?:angles?|parallel|slant\w*|radians?|inclined|oblique)\b/.test(topic) && !/\bperpendicular\b/.test(topic)) return null;
    if (!validSide(force) || !validSide(distance) || !Number.isFinite(degrees) || degrees > 180) return null;
    const downward = /\b(?:downward|downwards|straight down|push(?:ing|es)? down|clockwise)\b/.test(topic);
    return torque(force, distance, degrees, !angles.length && !/\bperpendicular\b/.test(topic), downward);
  }
  return null;
}
