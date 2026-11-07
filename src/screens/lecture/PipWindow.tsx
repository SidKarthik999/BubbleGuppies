import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from "react";
import { Icon } from "../../components/ui/Icon";

// Picture-in-picture that snaps to the 4 corners with flick projection, modelled on
// iOS PiP (WWDC 2018 "Designing Fluid Interfaces"). Numbers are the spec's (CONTEXT §4).

export const PIP = {
  side: 20,
  top: 78,
  bottom: 80,
  defaultWidth: 300,
  minWidth: 240,
  maxWidth: 460,
  aspect: 0.72, // height / width
  rubberBand: 0.35,
  sampleCount: 6,
  stillMs: 90,
  decelerationRate: 0.998, // UIScrollView .normal
  dampingRatio: 0.82,
  response: 0.38,
  tuckVelocity: 1600,
  tuckOvershoot: 40,
  tabWidth: 30,
} as const;

type Corner = 0 | 1 | 2 | 3; // 0 TL, 1 TR, 2 BL, 3 BR
type Side = "left" | "right";
type Vec = { x: number; y: number };

const isLeft = (c: Corner) => c === 0 || c === 2;
const isTop = (c: Corner) => c === 0 || c === 1;

/** Distance a velocity carries a point with UIScrollView-style deceleration. */
export function project(v: number, rate: number = PIP.decelerationRate): number {
  return ((v / 1000) * rate) / (1 - rate);
}

function rubber(value: number, min: number, max: number): number {
  if (value < min) return min - (min - value) * PIP.rubberBand;
  if (value > max) return max + (value - max) * PIP.rubberBand;
  return value;
}

type Props = {
  stageRef: RefObject<HTMLElement>;
  children: ReactNode;
  onExpand: () => void;
  onClose: () => void;
  /** Top snap line. The spec's 78 pt sits under the top bar; pass more when a toolbar row is below it. */
  topInset?: number;
};

export function PipWindow({ stageRef, children, onExpand, onClose, topInset = PIP.top }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const pos = useRef<Vec>({ x: 0, y: 0 });
  const anim = useRef<number | null>(null);
  const [corner, setCorner] = useState<Corner>(1);
  const [tucked, setTucked] = useState<Side | null>(null);
  const [width, setWidth] = useState<number>(PIP.defaultWidth);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const height = Math.round(width * PIP.aspect);

  const state = useRef({ corner, tucked, width, height, stage, topInset });
  state.current = { corner, tucked, width, height, stage, topInset };

  const apply = useCallback(() => {
    const el = elRef.current;
    if (el) el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
  }, []);

  const bounds = useCallback((w: number, h: number) => {
    const { stage: s, topInset: top } = state.current;
    return { minX: PIP.side, maxX: s.w - PIP.side - w, minY: top, maxY: Math.max(top, s.h - PIP.bottom - h) };
  }, []);

  const cornerPos = useCallback(
    (c: Corner, w = state.current.width, h = state.current.height): Vec => {
      const b = bounds(w, h);
      return { x: isLeft(c) ? b.minX : b.maxX, y: isTop(c) ? b.minY : b.maxY };
    },
    [bounds]
  );

  const tuckPos = useCallback(
    (side: Side, y: number): Vec => {
      const { stage: s, width: w, height: h } = state.current;
      const b = bounds(w, h);
      return { x: side === "left" ? -w + PIP.tabWidth : s.w - PIP.tabWidth, y: Math.min(b.maxY, Math.max(b.minY, y)) };
    },
    [bounds]
  );

  /** Critically-tuned spring that starts at the finger's release velocity. */
  const springTo = useCallback(
    (target: Vec, velocity: Vec = { x: 0, y: 0 }) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const k = Math.pow((2 * Math.PI) / PIP.response, 2);
      const c = (4 * Math.PI * PIP.dampingRatio) / PIP.response;
      const v = { ...velocity };
      let last = performance.now();
      const step = (now: number) => {
        let dt = Math.min(0.064, (now - last) / 1000);
        last = now;
        while (dt > 0) {
          const h = Math.min(dt, 1 / 240);
          for (const axis of ["x", "y"] as const) {
            const disp = pos.current[axis] - target[axis];
            v[axis] += (-k * disp - c * v[axis]) * h;
            pos.current[axis] += v[axis] * h;
          }
          dt -= h;
        }
        apply();
        const done =
          Math.abs(pos.current.x - target.x) < 0.4 && Math.abs(pos.current.y - target.y) < 0.4 && Math.abs(v.x) < 4 && Math.abs(v.y) < 4;
        if (done) {
          pos.current = { ...target };
          apply();
          anim.current = null;
        } else anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply]
  );

  // Track the stage size; re-seat the window when it changes.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageRef]);

  useLayoutEffect(() => {
    if (stage.w === 0 || dragging) return;
    if (anim.current) cancelAnimationFrame(anim.current);
    pos.current = tucked ? tuckPos(tucked, pos.current.y) : cornerPos(corner);
    apply();
    // Only re-seat on layout changes, not on every corner change (those animate).
  }, [stage.w, stage.h, width]);

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  // ---------------------------------------------------------------- drag
  const drag = useRef<{ id: number; offset: Vec; samples: { t: number; x: number; y: number }[]; moved: boolean } | null>(null);

  const onPointerDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest("button, .pip-resize")) return;
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = null;
    const r = stageRef.current!.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    drag.current = { id: e.pointerId, offset: { x: p.x - pos.current.x, y: p.y - pos.current.y }, samples: [{ t: e.timeStamp, ...p }], moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  };

  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = stageRef.current!.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    d.samples.push({ t: e.timeStamp, ...p });
    if (d.samples.length > PIP.sampleCount) d.samples.shift();
    if (!d.moved && Math.hypot(p.x - d.samples[0].x, p.y - d.samples[0].y) > 4) {
      d.moved = true;
      setDragging(true);
    }
    if (!d.moved) return;
    const b = bounds(state.current.width, state.current.height);
    // While tucked the window may sit past the edge; rubber-band relative to the normal bounds.
    pos.current = { x: rubber(p.x - d.offset.x, b.minX, b.maxX), y: rubber(p.y - d.offset.y, b.minY, b.maxY) };
    apply();
  };

  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    const { tucked: tk, width: w, height: h, stage: s } = state.current;

    if (!d.moved) {
      // A tap on the tab springs the window back out.
      if (tk) {
        const c: Corner = tk === "left" ? (pos.current.y < s.h / 2 ? 0 : 2) : pos.current.y < s.h / 2 ? 1 : 3;
        setTucked(null);
        setCorner(c);
        springTo(cornerPos(c));
      }
      return;
    }

    // Velocity from the last samples; a finger held still >90 ms means no flick.
    const smp = d.samples;
    const first = smp[0];
    const lastS = smp[smp.length - 1];
    const dt = (lastS.t - first.t) / 1000;
    const still = e.timeStamp - lastS.t > PIP.stillMs;
    const v = still || dt <= 0 ? { x: 0, y: 0 } : { x: (lastS.x - first.x) / dt, y: (lastS.y - first.y) / dt };

    const projected = { x: pos.current.x + project(v.x), y: pos.current.y + project(v.y) };
    const centerX = projected.x + w / 2;

    if (Math.abs(v.x) > PIP.tuckVelocity && (centerX < -PIP.tuckOvershoot || centerX > s.w + PIP.tuckOvershoot)) {
      const side: Side = centerX < 0 ? "left" : "right";
      setTucked(side);
      springTo(tuckPos(side, projected.y), v);
      return;
    }

    // Nearest corner to where the flick would carry the window, not where it was released.
    let best: Corner = 0;
    let bestD = Infinity;
    for (const c of [0, 1, 2, 3] as Corner[]) {
      const cp = cornerPos(c, w, h);
      const dist = Math.hypot(cp.x - projected.x, cp.y - projected.y);
      if (dist < bestD) {
        bestD = dist;
        best = c;
      }
    }
    setTucked(null);
    setCorner(best);
    springTo(cornerPos(best, w, h), v);
  };

  const tuck = () => {
    const side: Side = isLeft(state.current.corner) ? "left" : "right";
    setTucked(side);
    springTo(tuckPos(side, pos.current.y));
  };

  // -------------------------------------------------------------- resize (inner corner)
  const resize = useRef<{ id: number; startX: number; startY: number; startW: number } | null>(null);
  const onResizeDown = (e: RPointerEvent) => {
    e.stopPropagation();
    resize.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, startW: state.current.width };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  };
  const onResizeMove = (e: RPointerEvent) => {
    const r = resize.current;
    if (!r || r.id !== e.pointerId) return;
    const c = state.current.corner;
    // Growing toward the screen center: right for left corners, down for top corners.
    const dx = (e.clientX - r.startX) * (isLeft(c) ? 1 : -1);
    const dy = ((e.clientY - r.startY) * (isTop(c) ? 1 : -1)) / PIP.aspect;
    const next = Math.round(Math.min(PIP.maxWidth, Math.max(PIP.minWidth, r.startW + Math.max(dx, dy))));
    setWidth(next);
    // Keep the outer corner pinned.
    pos.current = cornerPos(c, next, Math.round(next * PIP.aspect));
    apply();
  };
  const onResizeUp = (e: RPointerEvent) => {
    if (resize.current?.id === e.pointerId) resize.current = null;
  };

  const ghosts = dragging && stage.w > 0 ? ([0, 1, 2, 3] as Corner[]).map((c) => ({ c, ...cornerPos(c) })) : [];
  const innerCornerClass = `${isTop(corner) ? "b" : "t"}${isLeft(corner) ? "r" : "l"}`;

  return (
    <>
      {ghosts.map((g) => (
        <div key={g.c} className="pip-ghost" style={{ transform: `translate3d(${g.x}px, ${g.y}px, 0)`, width, height }} aria-hidden="true" />
      ))}
      <div
        ref={elRef}
        className={`pip ${dragging ? "dragging" : ""} ${tucked ? `tucked ${tucked}` : ""}`}
        style={{ width, height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="region"
        aria-label="Live feed, picture in picture"
      >
        <div className="pip-content">{children}</div>
        <div className="pip-controls">
          <button className="pip-btn" onClick={tuck} aria-label="Tuck away" title="Tuck away">
            <Icon name="minus" size={14} />
          </button>
          <button className="pip-btn" onClick={onExpand} aria-label="Expand to split view" title="Expand">
            <Icon name="expand" size={14} />
          </button>
          <button className="pip-btn" onClick={onClose} aria-label="Hide live feed" title="Hide (recording continues)">
            <Icon name="close" size={14} />
          </button>
        </div>
        {!tucked && (
          <div
            className={`pip-resize ${innerCornerClass}`}
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            aria-hidden="true"
          />
        )}
        {tucked && <div className={`pip-tab ${tucked}`} aria-label="Show live feed" />}
      </div>
    </>
  );
}
