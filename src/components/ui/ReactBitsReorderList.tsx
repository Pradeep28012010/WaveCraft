import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback
} from 'react';
import './ReactBitsReorderList.css';

const FOLLOW = 30;
const SETTLE = 16;
const STACK_K = 320;
const STACK_C = 22;
const STAGGER = 0.035;
const HYSTERESIS = 8;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const ease = (from: number, to: number, dt: number, tau: number): number =>
  from + (to - from) * (1 - Math.exp(-dt / tau));

const spring = (
  p: number,
  v: number,
  target: number,
  dt: number,
  omega: number
): [number, number] => {
  const offset = p - target;
  const term = v + omega * offset;
  const decay = Math.exp(-omega * dt);
  return [target + (offset + term * dt) * decay, (v - omega * term * dt) * decay];
};

const isReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export interface ReactBitsReorderListProps<T extends { id: string | number }> {
  items: T[];
  renderItem: (item: T, index: number, isDragging: boolean) => React.ReactNode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  gap?: number;
  dragTilt?: number;
  lift?: number;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
}

interface DragState<T> {
  key: string | number;
  item: T;
  el: HTMLElement;
  slot: HTMLElement;
  W: number;
  H: number;
  rx: number;
  ry: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  tilt: number;
  lift: number;
  gx: number;
  gy: number;
  px: number;
  py: number;
  ox: number;
  oy: number;
  moved: boolean;
  from: number;
  j: number;
  phase: 'drag' | 'return';
  pointerId: number | null;
}

interface SlotShift {
  el: HTMLElement;
  y: number;
  v: number;
  target: number;
  delay: number;
}

export default function ReactBitsReorderList<T extends { id: string | number }>({
  items = [],
  renderItem,
  onReorder,
  gap = 8,
  dragTilt = 6,
  lift = 1.025,
  disabled = false,
  className = '',
  itemClassName = ''
}: ReactBitsReorderListProps<T>) {
  const rootRef = useRef<HTMLUListElement | null>(null);
  const slotEls = useRef<Map<string | number, HTMLElement>>(new Map());
  const itemEls = useRef<Map<string | number, HTMLElement>>(new Map());

  const cfg = useRef({
    items,
    gap,
    dragTilt,
    lift,
    disabled,
    onReorder
  });
  cfg.current = {
    items,
    gap,
    dragTilt,
    lift,
    disabled,
    onReorder
  };

  const sim = useRef<{
    raf: number;
    last: number;
    t: number;
    drag: DragState<T> | null;
    shifts: Map<HTMLElement, SlotShift>;
    tops: Map<HTMLElement, number>;
    timers: Set<ReturnType<typeof setTimeout>>;
  }>({
    raf: 0,
    last: 0,
    t: 0,
    drag: null,
    shifts: new Map(),
    tops: new Map(),
    timers: new Set()
  });

  const metrics = useCallback(() => {
    const root = rootRef.current;
    if (!root) return { left: 0, top: 0, width: 0 };
    const r = root.getBoundingClientRect();
    return { left: r.left, top: r.top, width: root.offsetWidth };
  }, []);

  const at = (el: HTMLElement, m: { left: number; top: number }) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - m.left, y: r.top - m.top };
  };

  const local = (e: React.PointerEvent | PointerEvent, m: { left: number; top: number }) => ({
    x: e.clientX - m.left,
    y: e.clientY - m.top
  });

  const shiftOf = (slot: HTMLElement): SlotShift => {
    const s = sim.current;
    let sh = s.shifts.get(slot);
    if (!sh) {
      sh = { el: slot, y: 0, v: 0, target: 0, delay: 0 };
      s.shifts.set(slot, sh);
    }
    return sh;
  };

  const run = useCallback(() => {
    const s = sim.current;
    if (s.raf) return;
    s.last = performance.now();
    s.raf = requestAnimationFrame(step);
  }, []);

  const settle = useCallback((fromIndex?: number) => {
    const s = sim.current;
    const root = rootRef.current;
    if (!root) return;
    const m = metrics();
    const nextTops = new Map<HTMLElement, number>();
    const still = isReducedMotion();
    const activeSlot = s.drag ? s.drag.slot : null;

    cfg.current.items.forEach((item, idx) => {
      const slot = slotEls.current.get(item.id);
      if (!slot) return;
      const sh = s.shifts.get(slot);
      const top = at(slot, m).y - (sh ? sh.y : 0);
      const prev = s.tops.get(slot);
      nextTops.set(slot, top);

      if (slot === activeSlot || still || prev === undefined) return;
      const delta = prev - top;
      if (Math.abs(delta) < 0.5) return;

      const rec = shiftOf(slot);
      rec.y += delta;
      if (fromIndex !== undefined && fromIndex >= 0) {
        rec.delay = Math.max(0, Math.abs(fromIndex - idx)) * STAGGER;
      }
      slot.style.transform = `translateY(${rec.y}px)`;
    });

    s.tops = nextTops;
    run();
  }, [metrics, run]);

  const aim = (d: DragState<T>, m: { left: number; top: number }) => {
    const s = sim.current;
    const c = cfg.current;
    const rows: { slot: HTMLElement; mid: number; idx: number }[] = [];

    c.items.forEach((item, idx) => {
      if (item.id === d.key) return;
      const slot = slotEls.current.get(item.id);
      if (!slot) return;
      const top = s.tops.get(slot) ?? at(slot, m).y;
      rows.push({ slot, mid: top + slot.offsetHeight / 2, idx });
    });

    let j = d.from;
    if (d.moved) {
      const cy = d.ry + d.H / 2;
      let count = 0;
      rows.forEach((row) => {
        if (row.mid < cy) count += 1;
      });

      if (d.j >= 0 && count !== d.j) {
        const edge = rows[count > d.j ? count - 1 : count];
        if (edge && Math.abs(edge.mid - cy) < HYSTERESIS) {
          count = d.j;
        }
      }
      j = count;
    }

    if (j === d.j) return;
    d.j = j;

    // Shift other slots to open space at target index j
    rows.forEach((row) => {
      const sh = shiftOf(row.slot);
      if (j > d.from) {
        // Dragged downwards: rows between (from, j] shift upwards
        sh.target = row.idx > d.from && row.idx <= j ? -(d.H + c.gap) : 0;
      } else if (j < d.from) {
        // Dragged upwards: rows between [j, from) shift downwards
        sh.target = row.idx >= j && row.idx < d.from ? (d.H + c.gap) : 0;
      } else {
        sh.target = 0;
      }
    });
  };

  const tick = (now: number) => {
    const s = sim.current;
    const c = cfg.current;
    const root = rootRef.current;
    if (!root) {
      s.raf = 0;
      return;
    }

    const dt = clamp((now - s.last) / 1000, 0, 0.05);
    s.last = now;
    s.t += dt;
    const m = metrics();
    const d = s.drag;

    if (d) {
      if (!d.el.isConnected) {
        s.drag = null;
      } else {
        const sp = at(d.slot, m);
        if (d.phase === 'drag') {
          d.tx = d.px - d.gx;
          d.ty = d.py - d.gy;
          if (!d.moved && Math.hypot(d.px - d.ox, d.py - d.oy) > 5) {
            d.moved = true;
            d.el.dataset.state = 'drag';
          }
          if (d.moved) {
            aim(d, m);
          }
        } else {
          // Return / drop settle phase
          d.tx = sp.x;
          d.ty = sp.y;
        }

        const omega = d.phase === 'drag' ? FOLLOW : SETTLE;
        [d.rx, d.vx] = spring(d.rx, d.vx, d.tx, dt, omega);
        [d.ry, d.vy] = spring(d.ry, d.vy, d.ty, dt, omega);

        const lean = d.phase === 'drag' ? clamp(d.vx * 0.012, -c.dragTilt, c.dragTilt) : 0;
        d.tilt = ease(d.tilt, lean, dt, 0.09);
        d.lift = ease(d.lift, d.phase === 'return' ? 1 : c.lift, dt, 0.12);

        d.el.style.transform = `translate(${d.rx - sp.x}px, ${d.ry - sp.y}px) rotate(${d.tilt}deg) scale(${d.lift})`;

        if (d.phase === 'return') {
          const settled =
            Math.abs(d.rx - d.tx) < 0.25 &&
            Math.abs(d.ry - d.ty) < 0.25 &&
            Math.abs(d.vx) < 2 &&
            Math.abs(d.vy) < 2 &&
            Math.abs(d.lift - 1) < 0.003 &&
            Math.abs(d.tilt) < 0.05;

          if (settled) {
            d.el.style.transform = '';
            delete d.el.dataset.state;
            s.drag = null;
          }
        }
      }
    }

    let moving = false;
    s.shifts.forEach((sh, el) => {
      if (!el.isConnected) {
        s.shifts.delete(el);
        return;
      }
      if (sh.delay > 0) {
        sh.delay -= dt;
        moving = true;
        return;
      }

      const n = Math.ceil(dt * 240);
      const h = dt / n;
      for (let k = 0; k < n; k += 1) {
        sh.v += (-STACK_K * (sh.y - sh.target) - STACK_C * sh.v) * h;
        sh.y += sh.v * h;
      }

      if (Math.abs(sh.y - sh.target) < 0.15 && Math.abs(sh.v) < 4) {
        sh.y = sh.target;
        sh.v = 0;
        if (sh.target === 0) {
          el.style.transform = '';
          s.shifts.delete(el);
        } else {
          el.style.transform = `translateY(${sh.y}px)`;
        }
      } else {
        el.style.transform = `translateY(${sh.y}px)`;
        moving = true;
      }
    });

    if (s.drag || moving) {
      s.raf = requestAnimationFrame(step);
    } else {
      s.raf = 0;
    }
  };

  const step = (now: number) => {
    try {
      tick(now);
    } catch {
      sim.current.raf = 0;
    }
  };

  const onPointerDown = (e: React.PointerEvent, item: T, index: number) => {
    if (e.button !== 0 || cfg.current.disabled) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, a, input, select, textarea, [data-no-drag="true"]')) {
      return;
    }

    const key = item.id;
    const el = itemEls.current.get(key);
    const slot = slotEls.current.get(key);
    if (!el || !slot) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const m = metrics();
    const sp = at(slot, m);
    const p = local(e, m);

    sim.current.drag = {
      key,
      item,
      el,
      slot,
      W: slot.offsetWidth,
      H: slot.offsetHeight,
      rx: sp.x,
      ry: sp.y,
      tx: sp.x,
      ty: sp.y,
      vx: 0,
      vy: 0,
      tilt: 0,
      lift: 1,
      gx: p.x - sp.x,
      gy: p.y - sp.y,
      px: p.x,
      py: p.y,
      ox: p.x,
      oy: p.y,
      moved: false,
      from: index,
      j: index,
      phase: 'drag',
      pointerId: e.pointerId
    };

    sim.current.shifts.delete(slot);
    slot.style.transform = '';
    run();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = sim.current.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = local(e, metrics());
    d.px = p.x;
    d.py = p.y;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = sim.current.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    d.pointerId = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (d.moved && d.j !== d.from && d.j >= 0) {
      const from = d.from;
      const to = clamp(d.j, 0, cfg.current.items.length - 1);
      cfg.current.onReorder?.(from, to);
    }

    sim.current.shifts.forEach((sh) => {
      sh.target = 0;
    });

    if (d.moved) {
      d.phase = 'return';
    } else {
      // Just a tap/click
      d.el.style.transform = '';
      delete d.el.dataset.state;
      sim.current.drag = null;
    }

    run();
  };

  useLayoutEffect(() => {
    settle();
  });

  useEffect(() => {
    const s = sim.current;
    return () => {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.timers.forEach((id) => clearTimeout(id));
      s.timers.clear();
    };
  }, []);

  const keepSlot = (key: string | number) => (el: HTMLElement | null) => {
    if (el) slotEls.current.set(key, el);
    else slotEls.current.delete(key);
  };

  const keepItem = (key: string | number) => (el: HTMLElement | null) => {
    if (el) itemEls.current.set(key, el);
    else itemEls.current.delete(key);
  };

  return (
    <ul ref={rootRef} className={`rb-reorder-list ${className}`.trim()}>
      {items.map((item, index) => {
        const isDragging = sim.current.drag?.key === item.id;
        return (
          <li
            key={item.id}
            ref={keepSlot(item.id)}
            className="rb-reorder-slot"
            style={{ marginBottom: index < items.length - 1 ? `${gap}px` : undefined }}
          >
            <div
              ref={keepItem(item.id)}
              className={`rb-reorder-item ${itemClassName}`.trim()}
              onPointerDown={(e) => onPointerDown(e, item, index)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onLostPointerCapture={onPointerUp}
            >
              {renderItem(item, index, isDragging)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
