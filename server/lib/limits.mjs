// Limits from the v2.1 shared contract, plus server-chosen caps for fields
// the contract leaves open (marked "server").

export const LIMITS = Object.freeze({
  // Request bodies
  bodyBytes: 256 * 1024,
  transcribeBodyBytes: 2 * 1024 * 1024,
  // Ink images
  pngBytes: 1.5 * 1024 * 1024,
  pngSide: 2048,
  contextChars: 500,
  transcriptionChars: 2000, // server
  texChars: 1000, // server
  // Segments (v1, unchanged)
  minSegments: 1,
  maxSegments: 12,
  segmentIdChars: 128,
  segmentTextChars: 4000,
  // Cues and sources
  cues: 10,
  cueTextChars: 1000, // server
  materials: 8,
  notes: 8,
  excerptChars: 1500,
  excerptMetaChars: 200, // server: title, locator, sessionTitle
  recentVisualTypes: 5,
  // Visual output (v2.1)
  topicChars: 120,
  recapChars: 500,
  nodes: 12,
  edges: 24,
  groups: 5,
  labelWords: 6,
  labelChars: 60, // server: hard cap after the 6-word clip
  groupChars: 40, // server
  detailChars: 160,
  edgeLabelChars: 60,
  idChars: 64,
  chartPointsMin: 2,
  chartPointsMax: 12,
  chartUnitChars: 30, // server
  // currentVisual input accepted from v1 browsers (lenient)
  inputNodes: 16,
  inputLabelChars: 100,
  // Answers
  cueTitleChars: 120, // server
  cueBodyChars: 600,
  citationsPerItem: 4, // server
  // Assist
  problemTextChars: 4000,
  problemLabelChars: 120, // server
  questionChars: 1000, // server
  studentWorkChars: 2000,
  hintChars: 800,
  relevantNotes: 4,
  whyChars: 200, // server
  equations: 4,
  equationTextChars: 300, // server
});
