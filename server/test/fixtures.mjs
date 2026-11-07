// Shared fixture data for tests and the README smoke test.

export const SEGMENTS = [
  {
    id: "s1",
    startSec: 0,
    endSec: 6.5,
    text: "Okay everyone, let's get started. Today we're covering photosynthesis.",
  },
  {
    id: "s2",
    startSec: 6.5,
    endSec: 18.2,
    text: "In the light reactions, light hits chlorophyll in the thylakoid membrane, and that energy is used to split water molecules, releasing oxygen.",
  },
  {
    id: "s3",
    startSec: 18.2,
    endSec: 29.9,
    text: "The energy from that electron transport chain produces ATP and NADPH, which then power the Calvin cycle in the stroma.",
  },
];

export const CURRENT_VISUAL = {
  topic: "Photosynthesis light reactions",
  recap: "Light energy splits water and produces ATP and NADPH.",
  visualType: "flowchart",
  nodes: [
    { id: "n1", label: "Light hits chlorophyll" },
    { id: "n2", label: "Water is split" },
    { id: "n3", label: "ATP and NADPH" },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3", label: "drives" },
  ],
  sourceStartSec: 6.5,
};
