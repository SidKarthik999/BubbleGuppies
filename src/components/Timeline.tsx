import { formatClock } from "../lib/lectureClock";
import type { Card } from "../types";

type Props = {
  cards: Card[];
  viewingId: string | null;
  latestId: string | null;
  onSelect: (id: string) => void;
};

/** Ordered list of study-guide cards. An update to the latest topic revises
 * that card in place (handled upstream); this just renders the current
 * list, highlighting whichever card is currently being viewed. */
export function Timeline({ cards, viewingId, latestId, onSelect }: Props) {
  if (cards.length === 0) return null;
  const effectiveId = viewingId ?? latestId;

  return (
    <div>
      <div className="panel-title" style={{ padding: "0 0 0.5rem" }}>
        Timeline
      </div>
      <div className="timeline">
        {cards.map((card) => (
          <button
            key={card.id}
            className={`timeline-item ${card.id === effectiveId ? "active" : ""}`}
            onClick={() => onSelect(card.id)}
          >
            <span>{card.visual.topic}</span>
            <span className="ts">{formatClock(card.visual.sourceStartSec)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
