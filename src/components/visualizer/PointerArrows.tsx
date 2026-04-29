'use client';

import { useEffect, useState, useLayoutEffect } from 'react';

interface Arrow {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  highlighted: boolean;
}

interface Props {
  /** Container element that the SVG should overlay */
  containerRef: React.RefObject<HTMLDivElement>;
  /** A trace step index — bumping it triggers a recalculation */
  stepKey: number;
  /** IDs that should be drawn with the highlight color */
  highlightIds?: Set<string>;
}

/**
 * Scans the DOM under containerRef for two attribute markers:
 *   - data-heap-ref="<id>"   → arrow source (a variable that points to <id>)
 *   - data-heap-id="<id>"    → arrow target (the heap card with that id)
 *
 * Then draws curved SVG paths between them. Recomputes on every step change
 * AND on container resize / layout shift via ResizeObserver.
 */
export function PointerArrows({ containerRef, stepKey, highlightIds }: Props) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const recompute = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });

    const sources = container.querySelectorAll<HTMLElement>('[data-heap-ref]');
    const targetMap = new Map<string, HTMLElement>();
    container
      .querySelectorAll<HTMLElement>('[data-heap-id]')
      .forEach((el) => {
        const id = el.dataset.heapId;
        if (id) targetMap.set(id, el);
      });

    const next: Arrow[] = [];
    let counter = 0;
    sources.forEach((src) => {
      const id = src.dataset.heapRef;
      if (!id) return;
      const target = targetMap.get(id);
      if (!target) return;

      const sRect = src.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();

      // From: right-center of source. To: left-center of target.
      const x1 = sRect.right - rect.left;
      const y1 = sRect.top + sRect.height / 2 - rect.top;
      const x2 = tRect.left - rect.left;
      const y2 = tRect.top + tRect.height / 2 - rect.top;

      next.push({
        id: `${id}-${counter++}`,
        x1,
        y1,
        x2,
        y2,
        highlighted: highlightIds?.has(id) ?? false,
      });
    });
    setArrows(next);
  };

  // Recompute on step change
  useLayoutEffect(() => {
    // Two RAFs — let the DOM commit, then measure
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(recompute);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, highlightIds]);

  // Recompute on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(recompute);
    });
    ro.observe(container);

    // Also recompute on scroll within the container
    const onScroll = () => requestAnimationFrame(recompute);
    container.addEventListener('scroll', onScroll, true);

    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (size.w === 0) return null;

  return (
    <svg
      width={size.w}
      height={size.h}
      className="pointer-events-none absolute inset-0 z-10"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker
          id="arrowhead-pink"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="#FF2D95" opacity="0.85" />
        </marker>
        <marker
          id="arrowhead-cyan"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="#00E5FF" />
        </marker>
        <filter id="arrow-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {arrows.map((arrow) => {
        const dx = arrow.x2 - arrow.x1;
        // Curve control points — bend horizontally
        const cp1x = arrow.x1 + Math.max(40, Math.abs(dx) * 0.35);
        const cp1y = arrow.y1;
        const cp2x = arrow.x2 - Math.max(40, Math.abs(dx) * 0.35);
        const cp2y = arrow.y2;
        const path = `M ${arrow.x1} ${arrow.y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${arrow.x2} ${arrow.y2}`;

        const stroke = arrow.highlighted ? '#00E5FF' : '#FF2D95';
        const opacity = arrow.highlighted ? 0.95 : 0.55;
        const strokeWidth = arrow.highlighted ? 1.75 : 1.25;
        const marker = arrow.highlighted ? 'arrowhead-cyan' : 'arrowhead-pink';

        return (
          <g key={arrow.id}>
            <path
              d={path}
              stroke={stroke}
              strokeWidth={strokeWidth}
              fill="none"
              opacity={opacity}
              strokeDasharray={arrow.highlighted ? 'none' : '4 3'}
              markerEnd={`url(#${marker})`}
              filter={arrow.highlighted ? 'url(#arrow-glow-cyan)' : undefined}
            />
            {/* Source dot */}
            <circle
              cx={arrow.x1}
              cy={arrow.y1}
              r={2.5}
              fill={stroke}
              opacity={opacity}
            />
          </g>
        );
      })}
    </svg>
  );
}
