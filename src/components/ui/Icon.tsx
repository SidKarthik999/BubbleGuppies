// Small stroke icon set (24 × 24 grid, currentColor) so the UI needs no icon font.

const PATHS = {
  pen: "M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16l-1 4zM14 7l3 3",
  highlighter: "M9 15l-4 4h5l2-2M9 15l6-11 5 3-6 11-5-3zM8 21h12",
  eraser: "M8 20h12M5.5 14.5l7-7a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8l-2.5-2.5a1.4 1.4 0 0 1 0-2z",
  lasso: "M12 4c4.4 0 8 2.2 8 5s-3.6 5-8 5-8-2.2-8-5 3.6-5 8-5zM7 13c-1 1.6-.6 3.5 1 4.2M8 17.2c.4 1.5-.2 2.6-1.4 2.8",
  text: "M5 6V5h14v1M12 5v14M9 19h6",
  play: "M8 5.5v13l10-6.5-10-6.5z",
  pause: "M8 5v14M16 5v14",
  stop: "M7 7h10v10H7z",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  minus: "M6 12h12",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4",
  back: "M15 5l-7 7 7 7",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4",
  notes: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  split: "M4 5h16v14H4zM11 5v14",
  feed: "M4 5h16v14H4zM8 15l3-4 3 3 2-2",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  check: "M5 12l5 5 9-10",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  const filled = name === "play" || name === "stop";
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 1.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
