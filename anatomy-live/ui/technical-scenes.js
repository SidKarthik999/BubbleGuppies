export const technicalDrawing = (() => {
  const number = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
  const format = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6, useGrouping: false });
  const show = value => format.format(value);
  const result = value => (Math.abs(Number(show(value)) - value) <= Math.abs(value) * 1e-12 ? '= ' : '≈ ') + show(value);
  const label = (x, y, value, color = 'ink') => ['text', x, y, value, color];
  const line = (x1, y1, x2, y2, color = 'ink') => ['line', x1, y1, x2, y2, color];
  const arrow = (x1, y1, x2, y2, color = 'ink') => ['arrow', x1, y1, x2, y2, color];
  const circle = (x, y, radius, color = 'ink') => ['circle', x, y, radius, color];
  const box = (x, y, width, height, color = 'ink') => ['box', x, y, width, height, color];
  const polygon = (points, color = 'ink') => ['poly', points, color];
  const note = value => ['note', value];

  function incline(degrees, downhill, friction, angleGiven) {
    const angle = degrees * Math.PI / 180;
    const ux = Math.cos(angle), uy = -Math.sin(angle);
    const nx = -Math.sin(angle), ny = -Math.cos(angle);
    const at = (along, normal) => [400 + ux * along + nx * normal, 221 + uy * along + ny * normal];
    const floorLeft = at(-190, -20), floorRight = at(190, -20);
    const center = at(0, 0);
    const normal = at(0, 91);
    const frictionTip = at(downhill ? 108 : -108, -20);
    const geometry = [
      polygon([floorLeft, floorRight, [floorRight[0], floorLeft[1]]], 'muted'),
      polygon([at(-35, -20), at(35, -20), at(35, 20), at(-35, 20)], 'mint'),
      arrow(...at(0, -20), ...normal, 'mint'),
      label(normal[0] - 16, normal[1] - 17, 'N', 'mint'),
      arrow(...center, center[0], center[1] + 104, 'violet'),
      label(center[0] + 23, center[1] + 107, 'mg', 'violet'),
      label(620, 410, 'Incline ' + show(degrees) + '°' + (angleGiven ? '' : ' (example)'), 'muted')
    ];
    if (friction) geometry.push(
      arrow(...at(0, -20), ...frictionTip, 'amber'),
      label(frictionTip[0] + (downhill ? 24 : -24), frictionTip[1] - 16, 'fₖ', 'amber')
    );
    geometry.push(note(friction
      ? 'Gravity points down, the normal is perpendicular to the ramp, and kinetic friction opposes the slide. Arrow lengths are illustrative.'
      : 'Gravity points down and the normal is perpendicular to the ramp. The sketch assumes negligible friction.'));
    return geometry;
  }

  function gears(a, b) {
    const total = 178;
    const ra = total * a / (a + b), rb = total - ra;
    const xA = 222 + ra, xB = 578 - rb, y = 253;
    function gear(x, radius, teeth, color) {
      const pitch = 2 * Math.PI / teeth;
      const points = Array.from({ length: teeth * 4 }, (_, index) => {
        const angle = (Math.floor(index / 4) + [0, 0.24, 0.49, 0.73][index % 4]) * pitch;
        const depth = index % 4 < 2 ? radius : radius * 0.91;
        return [x + Math.cos(angle) * depth, y + Math.sin(angle) * depth];
      });
      return [polygon(points, color), circle(x, y, Math.min(14, radius / 4), color)];
    }
    const gearArrows = (x, direction, color) => {
      const start = x - direction * 22, end = x + direction * 22;
      return [
        ['curve', start, 92, x, 65, end, 83, color],
        arrow(end - direction * 8, 78, end, 83, color)
      ];
    };
    return [
      ...gear(xA, ra, a, 'mint'), ...gear(xB, rb, b, 'violet'),
      ...gearArrows(xA, 1, 'mint'), ...gearArrows(xB, -1, 'violet'),
      label(xA, 56, 'A · ' + a + ' teeth', 'mint'), label(xB, 56, 'B · ' + b + ' teeth', 'violet'),
      label(400, 438, '|ωA| / |ωB| ' + result(b / a)),
      note('External gears rotate in opposite directions. Their pitch speeds match at the mesh, so their angular speeds are inversely proportional to tooth count.')
    ];
  }

  function resistors(a, b, parallel) {
    const ohms = value => show(value) + ' Ω';
    const layout = parallel ? [
      line(107, 239, 216, 239), line(216, 143, 216, 335), line(216, 143, 352, 143),
      line(216, 335, 352, 335), line(448, 143, 584, 143), line(448, 335, 584, 335),
      line(584, 143, 584, 335), line(584, 239, 693, 239),
      circle(216, 239, 4), circle(584, 239, 4),
      box(352, 127, 96, 32, 'mint'), box(352, 319, 96, 32, 'violet'),
      label(400, 106, ohms(a), 'mint'), label(400, 298, ohms(b), 'violet')
    ] : [
      line(107, 239, 237, 239), box(237, 223, 96, 32, 'mint'),
      line(333, 239, 467, 239), box(467, 223, 96, 32, 'violet'), line(563, 239, 693, 239),
      label(285, 199, ohms(a), 'mint'), label(515, 199, ohms(b), 'violet')
    ];
    const resistance = parallel ? 1 / (1 / a + 1 / b) : a + b;
    return [
      ...layout, circle(103, 239, 4), circle(697, 239, 4),
      label(400, 410, 'Equivalent resistance ' + result(resistance) + ' Ω'),
      note(parallel ? 'Both resistors share the same pair of nodes. The reciprocals of their resistances add.' : 'The same current flows through both resistors. Their resistances add.')
    ];
  }

  function crossProduct(reverse) {
    const symbolX = 400, symbolY = 365;
    return [
      arrow(336, 276, 636, 276, 'mint'), label(658, 276, '+x', 'mint'),
      arrow(336, 276, 336, 78, 'violet'), label(336, 55, '+y', 'violet'),
      ['curve', 438, 276, 438, 177, 336, 177, 'amber'],
      reverse ? arrow(438, 257, 438, 276, 'amber') : arrow(355, 177, 336, 177, 'amber'),
      circle(336, 276, 5),
      circle(symbolX, symbolY, 14, 'amber'),
      ...(reverse
        ? [line(393, 358, 407, 372, 'amber'), line(407, 358, 393, 372, 'amber')]
        : [circle(symbolX, symbolY, 4, 'amber')]),
      label(400, 411, reverse ? 'y × x = −z · into the page' : 'x × y = +z · out of the page', 'amber'),
      note('Curl your right-hand fingers from the first vector toward the second. Your thumb points along the cross product.')
    ];
  }

  function npnSwitch() {
    return [
      label(515, 37, 'VCC', 'ink'), line(515, 52, 515, 73),
      box(499, 73, 32, 46, 'violet'), label(607, 95, 'LED resistor', 'violet'),
      line(515, 119, 515, 149), polygon([[501, 149], [529, 149], [515, 175]], 'amber'),
      line(499, 177, 531, 177, 'amber'), line(515, 177, 515, 224),
      arrow(535, 154, 557, 135, 'amber'), arrow(540, 170, 562, 151, 'amber'),
      label(606, 170, 'LED', 'amber'),
      circle(495, 269, 52, 'muted'),
      line(476, 243, 476, 298, 'mint'), line(476, 253, 515, 224, 'mint'),
      arrow(476, 287, 515, 317, 'mint'), label(601, 268, 'NPN switch', 'mint'),
      line(515, 317, 515, 357),
      line(493, 357, 537, 357), line(500, 365, 530, 365), line(507, 373, 523, 373),
      label(515, 398, 'Ground', 'muted'),
      label(155, 246, 'Control input', 'ink'), line(155, 271, 259, 271),
      box(259, 255, 92, 32, 'violet'), line(351, 271, 476, 271),
      label(305, 312, 'Base resistor', 'violet'),
      note('Base current turns the NPN on. LED current then flows from VCC through the series resistor, LED, collector and emitter to ground.')
    ];
  }

  function rcFilter(highPass) {
    const series = highPass
      ? [line(116, 155, 275, 155), line(275, 128, 275, 182, 'mint'),
        line(294, 128, 294, 182, 'mint'), line(294, 155, 465, 155),
        label(285, 107, 'C', 'mint')]
      : [line(116, 155, 238, 155), box(238, 139, 96, 32, 'violet'),
        line(334, 155, 465, 155), label(286, 107, 'R', 'violet')];
    const shunt = highPass
      ? [line(465, 155, 465, 220), box(450, 220, 30, 64, 'violet'),
        line(465, 284, 465, 345), label(505, 251, 'R', 'violet')]
      : [line(465, 155, 465, 236), line(439, 236, 491, 236, 'mint'),
        line(439, 257, 491, 257, 'mint'), line(465, 257, 465, 345), label(516, 248, 'C', 'mint')];
    return [
      ...series, ...shunt,
      line(465, 155, 674, 155), line(116, 345, 674, 345, 'muted'),
      circle(465, 155, 4), circle(465, 345, 4),
      circle(111, 155, 4), circle(111, 345, 4), circle(679, 155, 4), circle(679, 345, 4),
      label(113, 117, 'Input'), label(675, 117, 'Output'),
      label(403, 373, 'Common ground', 'muted'),
      label(400, 428, highPass ? 'RC high-pass' : 'RC low-pass'),
      note(highPass
        ? 'The capacitor is in series. The output is measured across the resistor, so high frequencies pass.'
        : 'The resistor is in series. The output is measured across the capacitor, so low frequencies pass.')
    ];
  }

  function flyback() {
    return [
      label(400, 41, '+V supply'), line(283, 64, 548, 64), circle(400, 64, 4),
      line(283, 64, 283, 112), box(265, 112, 36, 76, 'violet'), label(190, 149, 'Relay coil', 'violet'),
      line(283, 188, 283, 225), line(283, 225, 548, 225), circle(283, 225, 4),
      line(548, 64, 548, 125), line(528, 125, 568, 125, 'mint'),
      polygon([[548, 127], [533, 158], [563, 158]], 'mint'),
      line(548, 158, 548, 225), label(642, 125, 'Cathode', 'mint'), label(645, 157, 'Flyback diode', 'mint'),
      line(283, 225, 283, 268), box(246, 268, 74, 70, 'amber'),
      label(283, 284, 'D', 'amber'), label(257, 303, 'G', 'amber'), label(283, 324, 'S', 'amber'),
      line(155, 303, 246, 303), label(132, 273, 'Gate drive', 'muted'),
      line(283, 338, 283, 366), line(260, 366, 306, 366), line(269, 373, 297, 373), line(277, 380, 289, 380),
      label(283, 410, 'N-MOSFET · low-side switch', 'amber'),
      note('The diode is normally reverse biased. When the MOSFET opens, the coil current returns through the diode to the supply node.')
    ];
  }

  function orbit(perihelion) {
    const x = 400, y = 239, a = 220, b = 126;
    const focus = x - Math.sqrt(a * a - b * b);
    const px = x + (perihelion ? -a : a);
    const velocity = perihelion ? -1 : 1;
    return [
      ['ellipse', x, y, a, b, 'muted'],
      circle(focus, y, 15, 'amber'), label(focus, 279, 'Sun at a focus', 'amber'),
      circle(px, y, 8, 'mint'),
      label(px, 282, perihelion ? 'Perihelion' : 'Aphelion', 'mint'),
      arrow(px, y, px, y + velocity * 95, 'violet'),
      label(px, y + velocity * 117, 'Velocity', 'violet'),
      arrow(px, y, px + (perihelion ? 70 : -70), y, 'mint'),
      label(px + (perihelion ? 70 : -70), y - 22, 'Gravity', 'mint'),
      note('Velocity is tangent to the orbit, while gravity points from the planet toward the Sun. Arrow lengths are illustrative.')
    ];
  }

  function voltageFollower() {
    return [
      polygon([[310, 136], [310, 306], [495, 221]], 'violet'),
      line(119, 175, 310, 175, 'mint'), label(121, 150, 'Vin', 'mint'), label(330, 175, '+', 'mint'),
      line(495, 221, 684, 221), label(684, 197, 'Vout'),
      line(579, 221, 579, 360, 'amber'), line(579, 360, 236, 360, 'amber'),
      line(236, 360, 236, 270, 'amber'), line(236, 270, 310, 270, 'amber'),
      label(330, 270, '−', 'amber'), circle(579, 221, 4),
      label(401, 389, 'Feedback to the inverting input', 'amber'),
      note('With negative feedback and the op amp operating within its limits, the output follows the input.')
    ];
  }

  function i2cTiming() {
    function trace(y, levels, color) {
      return levels.flatMap((level, i) => {
        const x = 157 + i * 97;
        const height = y + (level ? 0 : 32);
        const span = line(x, height, x + 97, height, color);
        return i && levels[i - 1] !== level ? [line(x, y, x, y + 32, color), span] : [span];
      });
    }
    return [
      ...trace(124, [1, 1, 0, 0, 1, 1], 'mint'),
      ...trace(243, [1, 0, 0, 0, 0, 1], 'violet'),
      label(100, 138, 'SCL', 'mint'), label(100, 257, 'SDA', 'violet'),
      label(254, 339, 'START', 'amber'), label(642, 339, 'STOP', 'amber'),
      arrow(254, 320, 254, 283, 'amber'), arrow(642, 320, 642, 283, 'amber'),
      label(254, 374, 'SDA falls', 'muted'), label(642, 374, 'SDA rises', 'muted'),
      note('START is a high-to-low SDA transition while SCL is high. STOP is low-to-high SDA while SCL is high.')
    ];
  }

  function venturi() {
    return [
      polygon([[85, 157], [210, 157], [329, 205], [471, 205], [590, 157], [715, 157],
        [715, 323], [590, 323], [471, 275], [329, 275], [210, 323], [85, 323]], 'muted'),
      arrow(112, 240, 184, 240, 'mint'), arrow(334, 240, 466, 240, 'amber'),
      arrow(616, 240, 688, 240, 'mint'),
      label(149, 111, 'Wide inlet', 'mint'), label(400, 155, 'Narrow throat', 'amber'),
      label(651, 111, 'Wide outlet', 'mint'),
      label(149, 360, 'Lower speed', 'mint'), label(400, 306, 'Higher speed', 'amber'),
      label(400, 339, 'Lower static pressure', 'amber'), label(651, 360, 'Speed decreases', 'mint'),
      note('For steady, low-speed flow, the same flow passes through less area at the throat. It speeds up and its static pressure drops.')
    ];
  }

  function induction(north, approaching) {
    const inducedLeft = north === approaching;
    const commands = [
      box(116, 185, 193, 84, 'muted'), line(212, 185, 212, 269, 'muted'),
      label(164, 226, north ? 'S' : 'N'), label(261, 226, north ? 'N' : 'S', 'amber'),
      ['ellipse', 480, 226, 23, 104, 'mint'], label(480, 358, 'Conducting loop', 'mint'),
      approaching ? arrow(172, 142, 266, 142, 'amber') : arrow(266, 142, 172, 142, 'amber'),
      label(220, 116, approaching ? 'Approaching' : 'Moving away', 'amber'),
      inducedLeft ? arrow(545, 226, 405, 226, 'violet') : arrow(405, 226, 545, 226, 'violet'),
      label(533, 173, 'Induced field', 'violet'),
      label(400, 415, inducedLeft ? 'Current: counterclockwise from magnet side' : 'Current: clockwise from magnet side'),
      note('The induced field opposes the change in magnetic flux through the loop.')
    ];
    return commands;
  }

  function steering(leftTurn) {
    const side = leftTurn ? -1 : 1;
    const center = [400 + side * 290, 341];
    const inner = [400 + side * 63, 143];
    const outer = [400 - side * 63, 143];
    const wheels = [inner, outer];
    const frontWheel = ([x, y], color) => {
      const radialX = x - center[0];
      const radialY = y - center[1];
      const length = Math.hypot(radialX, radialY);
      const forward = [-side * radialY / length, side * radialX / length];
      const axle = [radialX / length, radialY / length];
      const point = (a, b) => [x + a * forward[0] + b * axle[0], y + a * forward[1] + b * axle[1]];
      return polygon([point(-29, -11), point(29, -11), point(29, 11), point(-29, 11)], color);
    };
    return [
      box(350, 155, 100, 175, 'muted'),
      line(93, 341, 707, 341, 'muted'),
      ...wheels.map(([x, y], index) => line(...center, x, y, index ? 'violet' : 'mint')),
      frontWheel(inner, 'mint'), frontWheel(outer, 'violet'),
      box(326, 314, 22, 54), box(452, 314, 22, 54),
      circle(...center, 7, 'amber'),
      label(center[0] - side * 45, 382, 'Turning center', 'amber'),
      label(inner[0] + side * 77, 94, 'Inner wheel', 'mint'),
      label(outer[0] - side * 77, 94, 'Outer wheel', 'violet'),
      label(400, 413, 'Inner wheel steers through a larger angle'),
      note('In ideal Ackermann steering, the front wheel axes meet on the rear axle line at the instantaneous center of the turn.')
    ];
  }

  return prompt => {
    const topic = prompt.toLowerCase();
    if (/\b(?:free[ -]body|fbd)\b/.test(topic) && /\bblock\b/.test(topic) &&
        /\b(?:incline|ramp|slope)\b/.test(topic) &&
        !/\b(?:pulley|rope|tension|applied|push\w*|spring|static friction|force value|newtons?|kg)\b/.test(topic)) {
      const angle = topic.match(new RegExp(number + String.raw`\s*[- ]?\s*(?:°|degrees?\b)`));
      const degrees = angle ? Number(angle[1]) : 30;
      const downhill = /\b(?:down|downhill)\b/.test(topic);
      const uphill = /\b(?:up|uphill)\b/.test(topic);
      const friction = /\bfriction\b/.test(topic) && !/\b(?:frictionless|without (?:kinetic )?friction|no (?:kinetic )?friction)\b/.test(topic);
      if ((!friction || downhill !== uphill) && degrees >= 5 && degrees <= 75 &&
          (!/\d/.test(topic) || (angle && topic.match(/\d+(?:\.\d+)?/g).length === 1)) &&
          !/[-−]\d+\s*[- ]?\s*(?:°|degrees?\b)/u.test(topic)) return incline(degrees, downhill, friction, Boolean(angle));
    }
    if (/\bgears?\b/.test(topic) && !/\b(?:internal|worm|bevel|planetary|idler|rack|rpm)\b/.test(topic)) {
      const shared = topic.match(/\b(\d+)\s*(?:and|,|to)\s*(\d+)\s*teeth\b/);
      const separate = [...topic.matchAll(/\b(\d+)\s*-?\s*tooth\b/g)].map(match => match[1]);
      const pair = shared ? shared.slice(1, 3) : separate;
      if (pair.length === 2 && topic.match(/\d+/g)?.length === 2) {
        const [a, b] = pair.map(Number);
        if (Math.min(a, b) >= 8 && Math.max(a, b) <= 72 && Math.max(a, b) / Math.min(a, b) <= 5) return gears(a, b);
      }
    }
    if (/\bresistors?\b/.test(topic) && /\b(?:series|parallel)\b/.test(topic) &&
        !/\b(?:voltage|current|power)\b/.test(topic) && !(/\bseries\b/.test(topic) && /\bparallel\b/.test(topic))) {
      const pair = topic.match(new RegExp(number + String.raw`\s*(?:Ω|ohms?\b)?\s*(?:and|,)\s*` + number + String.raw`\s*(?:Ω|ohms?\b)`, 'iu'));
      if (pair && topic.match(/\d+(?:\.\d+)?/g)?.length === 2 && !/(?:^|[\s,])[-−]\d/u.test(topic)) {
        const [a, b] = pair.slice(1).map(Number);
        if (Math.min(a, b) > 0 && Math.max(a, b) <= 1e9) return resistors(a, b, /\bparallel\b/.test(topic));
      }
    }
    if (!/\d/.test(topic)) {
      const filter = topic.match(/\b(high|low)[- ]pass\b/);
      if (filter && /\brc\b/.test(topic) && /\bfilter\b/.test(topic)) {
        const highPass = filter[1] === 'high';
        const contradicts = highPass ? /across (?:the )?capacitor/ : /across (?:the )?resistor/;
        if (!contradicts.test(topic)) return rcFilter(highPass);
      }
      if (/\bflyback\b/.test(topic) && /\bdiode\b/.test(topic) && /\bmosfet\b/.test(topic) &&
          /\b(?:coil|relay)\b/.test(topic) && !/\b(?:high[- ]side|p[- ]channel|ac relay)\b/.test(topic)) return flyback();
      if (/\b(?:op[ -]?amp|operational amplifier)\b/.test(topic) &&
          /\b(?:voltage follower|unity[ -]gain buffer)\b/.test(topic)) return voltageFollower();
      if (/\b(?:venturi)\b/.test(topic) && /\b(?:throat|tube)\b/.test(topic) &&
          !/\b(?:supersonic|choked|compressible)\b/.test(topic)) return venturi();
      const near = /\bperihelion\b/.test(topic), far = /\baphelion\b/.test(topic);
      if (near !== far && /\b(?:orbit|orbiting)\b/.test(topic) && /\bplanet\b/.test(topic) &&
          !/\b(?:binary|two planets|compare|animation)\b/.test(topic)) return orbit(near);
    }
    if (/\backermann\b/.test(topic) && /\bsteer\w*\b/.test(topic) && !/\d|\b(?:reverse|anti|compare)\b/.test(topic)) {
      const leftTurn = /\bleft\b/.test(topic);
      const rightTurn = /\bright\b/.test(topic);
      if (leftTurn !== rightTurn) return steering(leftTurn);
    }
    if (/\bi[²2]c\b/.test(topic) && /\bstart\b/.test(topic) && /\bstop\b/.test(topic) &&
        !/\b(?:address|ack|read|write|bytes?)\b/.test(topic)) return i2cTiming();
    if (/\blenz\b/.test(topic) && /\bloop\b/.test(topic) &&
        !/\b(?:rotate|withdraw and approach|compare)\b/.test(topic) && !/\d/.test(topic)) {
      const north = /\bnorth pole\b/.test(topic), south = /\bsouth pole\b/.test(topic);
      const approach = /\b(?:toward|towards|approach\w*)\b/.test(topic);
      const recede = /\b(?:away|reced\w*|leav\w*)\b/.test(topic);
      if (north !== south && approach !== recede) return induction(north, approach);
    }
    const cross = topic.match(/\b([xy])\s*(?:×|cross)\s*([xy])\b/);
    if (cross && cross[1] !== cross[2] && !/\d/.test(topic) && /\b(?:right hand|right-hand|cross product)\b/.test(topic)) {
      return crossProduct(cross[1] === 'y');
    }
    if (/\bnpn\b/.test(topic) && /\bled\b/.test(topic) && /\blow[- ]side\b/.test(topic) &&
        !/\d|\b(?:multiple|relay|mosfet|pwm)\b/.test(topic)) return npnSwitch();
    return null;
  };
})();
