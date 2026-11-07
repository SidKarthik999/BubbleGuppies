export const organicDrawing = (() => {
  const path = (kind, data, color) => [kind, data.trim().split(/\s+/).map(segment => {
    const [letter, ...coordinates] = segment.split(',');
    return [letter, ...coordinates.map(Number)];
  }), color];
  const trace = (data, color = 'muted') => path('trace', data, color);
  const outline = (data, color) => path('path', data, color);
  const line = (x1, y1, x2, y2, color = 'muted') => ['line', x1, y1, x2, y2, color];
  const label = (x, y, value, color = 'ink') => ['text', x, y, value, color];
  const dot = (x, y, color) => ['circle', x, y, 3, color];

  function hand(bones) {
    const outer = outline(`
      M,350,437 C,350,408,345,382,332,360 C,320,341,305,326,292,307
      C,275,286,257,266,244,248 C,233,233,236,220,247,215 C,259,208,274,216,285,228
      L,319,267 C,321,252,319,231,318,214 L,309,124 C,307,109,316,101,327,101
      C,339,101,345,110,347,124 L,355,198 C,358,201,360,200,361,195
      L,360,80 C,360,66,368,58,380,58 C,393,58,400,68,400,82 L,396,191
      C,396,196,401,197,404,193 L,407,102 C,408,89,417,81,428,82
      C,440,83,446,92,445,106 L,437,208 C,437,213,443,215,446,209
      L,455,146 C,457,134,465,127,476,129 C,487,131,493,140,491,152
      L,480,244 C,478,271,473,302,462,328 C,454,347,442,359,434,378
      C,425,400,425,422,425,437 Z`, 'mint');

    if (bones) {
      // Points run from the base of each metacarpal to the fingertip.
      const digits = [
        [[360,355], [313,278], [280,245], [252,226]],
        [[373,356], [339,226], [335,174], [331,139], [327,113]],
        [[388,352], [379,223], [380,155], [380,109], [380,72]],
        [[402,353], [415,227], [421,173], [425,133], [427,95]],
        [[414,357], [449,247], [459,210], [469,173], [475,141]]
      ];
      const segments = digits.flatMap(points => points.slice(1).map(([x, y], index) => {
        const [x0, y0] = points[index];
        const length = Math.hypot(x - x0, y - y0);
        const ux = (x - x0) / length, uy = (y - y0) / length;
        const inset = index ? 4 : 7;
        return line(x0 + ux * inset, y0 + uy * inset, x - ux * inset, y - uy * inset, index ? 'amber' : 'violet');
      }));
      return [
        outer, ...segments,
        ...digits.flatMap(points => points.slice(1, -1).map(([x, y]) => dot(x, y, 'ink'))),
        ...[[369,365],[381,362],[394,363],[407,366],[374,376],[386,373],[398,375],[410,377]]
          .map(([x,y]) => ['circle', x, y, 4, 'muted']),
        line(449, 165, 526, 144), label(598, 144, 'Phalanges', 'amber'),
        line(427, 300, 515, 294), label(596, 294, 'Metacarpals', 'violet'),
        line(410, 373, 523, 385), label(584, 385, 'Carpals'),
        line(311, 263, 227, 278), label(154, 278, 'Thumb'),
        ['note', 'Simplified bone layout. The thumb has two phalanges, the other digits have three each, and the metacarpals extend through the palm.']
      ];
    }
    return [
      outer,
      trace('M,327,160 Q,333,163,341,160 M,330,183 Q,336,185,344,183'),
      trace('M,372,126 Q,380,129,390,126 M,372,151 Q,381,154,390,150'),
      trace('M,418,144 Q,426,148,435,144 M,417,168 Q,425,173,434,168'),
      trace('M,461,174 Q,470,179,480,176 M,458,195 Q,466,199,477,196'),
      trace('M,268,232 Q,276,240,279,249 M,282,246 Q,288,251,292,260'),
      trace('M,325,271 C,348,277,367,300,365,328 Q,365,353,383,379'),
      trace('M,333,255 C,355,245,378,243,394,249 Q,415,257,444,253'),
      trace('M,356,291 Q,399,281,447,280 M,357,402 Q,386,410,426,402'),
      line(251, 225, 213, 214), label(172, 214, 'Thumb'),
      line(311, 129, 267, 121), label(226, 121, 'Index'),
      line(380, 58, 380, 44), label(380, 30, 'Middle'),
      line(444, 100, 490, 87), label(530, 87, 'Ring'),
      line(489, 148, 523, 145), label(617, 145, 'Little finger'),
      line(458, 319, 515, 319), label(552, 319, 'Palm'),
      label(389, 458, 'Wrist'),
      ['note', 'Palm view. The shorter, angled thumb is separate from the four longer fingers, with the middle finger extending farthest.']
    ];
  }

  function jellyfish() {
    return [
      trace('M,271,218 C,249,256,278,267,260,306 C,249,331,272,356,250,379', 'violet'),
      trace('M,293,229 C,271,259,302,283,280,320 C,267,349,288,369,277,403', 'mint'),
      trace('M,319,234 C,302,271,326,296,307,328 C,292,354,322,384,307,414', 'violet'),
      trace('M,345,238 C,330,274,346,297,330,330 C,319,355,345,377,331,421', 'mint'),
      trace('M,456,238 C,475,272,452,303,471,331 C,489,356,461,385,473,419', 'mint'),
      trace('M,481,233 C,505,264,477,288,499,323 C,515,349,485,380,503,410', 'violet'),
      trace('M,506,227 C,531,255,507,282,526,313 C,545,348,518,369,536,395', 'mint'),
      trace('M,529,219 C,550,252,526,270,548,298 C,566,325,545,351,559,373', 'violet'),
      outline('M,238,207 C,248,135,311,85,400,85 C,489,85,552,134,562,207 C,547,233,476,244,400,244 C,324,244,252,233,238,207 Z', 'mint'),
      trace('M,238,207 C,266,182,330,176,400,176 C,470,176,534,182,562,207', 'mint'),
      trace('M,249,214 C,289,227,341,230,400,230 C,459,230,511,227,551,214', 'mint'),
      trace('M,259,182 C,278,144,318,115,354,108 M,271,174 C,289,144,313,129,333,121', 'muted'),
      trace('M,400,193 C,377,149,348,128,309,126 M,400,193 C,423,149,452,128,491,126', 'violet'),
      trace('M,400,193 Q,360,179,291,199 M,400,193 Q,440,179,509,199', 'violet'),
      ['ellipse', 400, 216, 28, 11, 'violet'],
      outline('M,389,227 C,380,248,355,257,366,279 C,380,302,356,320,364,346 C,368,357,366,375,356,391 C,382,374,392,352,385,332 C,378,309,403,291,392,270 C,385,257,404,246,403,227 Z', 'violet'),
      outline('M,403,227 C,417,246,444,256,435,276 C,426,298,450,321,438,342 C,430,356,438,376,445,392 C,418,379,412,356,421,337 C,432,315,406,299,416,276 C,425,256,399,248,393,227 Z', 'violet'),
      line(512, 122, 576, 97), label(616, 97, 'Bell', 'mint'),
      line(477, 156, 568, 150), label(653, 150, 'Radial canals', 'violet'),
      line(383, 221, 229, 221), label(186, 221, 'Mouth', 'violet'),
      line(437, 295, 565, 295), label(632, 295, 'Oral arms', 'violet'),
      line(282, 342, 207, 352), label(143, 352, 'Tentacles', 'mint'),
      ['note', 'Simplified jellyfish anatomy. In jellyfish with oral arms, the arms help move captured prey toward the mouth beneath the bell.']
    ];
  }

  return prompt => {
    const topic = prompt.toLowerCase().trim().replace(/[?.!]+$/, '');
    if (/^(?:draw (?:a |the )?|show (?:me )?(?:a |the )?)?(?:human )?hand(?: anat[oa]my| palm| skeleton| bones)?(?: diagram)?$/.test(topic) ||
        /^(?:draw |show )?(?:bones|skeleton|anatomy) of (?:a |the )?(?:human )?hand$/.test(topic)) {
      return hand(/\b(?:bones|skeleton)\b/.test(topic));
    }
    if (/^(?:draw (?:a |the )?|show (?:me )?(?:a |the )?)?jelly[ -]?fish(?: anatomy| medusa)?(?: diagram)?$/.test(topic) ||
        /^(?:draw |show )?anatomy of (?:a |the )?jellyfish$/.test(topic)) return jellyfish();
    return null;
  };
})();
