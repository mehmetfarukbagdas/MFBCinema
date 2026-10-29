import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PosterCarousel({
  children,
  label = "s",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  const update = () => {
    const el = trackRef.current;
    if (!el) return;
    setLeft(el.scrollLeft > 2);
    setRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
  };
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const move = (direction: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(260, el.clientWidth * 0.8),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };
  return (
    <div className="poster-carousel">
      {left && (
        <button
          type="button"
          className="carousel-arrow carousel-arrow-left"
          aria-label={`Previous ${label}`}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={19} />
        </button>
      )}
      <div
        ref={trackRef}
        className="poster-row"
        role="region"
        aria-label={label}
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          const el = trackRef.current;
          if (!el) return;
          drag.current = {
            active: true,
            startX: e.clientX,
            scrollLeft: el.scrollLeft,
            moved: false,
          };
          el.classList.add("is-dragging");
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = trackRef.current;
          if (!d.active || !el) return;
          const delta = e.clientX - d.startX;
          if (Math.abs(delta) > 5) d.moved = true;
          if (d.moved) el.scrollLeft = d.scrollLeft - delta;
        }}
        onPointerUp={() => {
          drag.current.active = false;
          trackRef.current?.classList.remove("is-dragging");
        }}
        onPointerCancel={() => {
          drag.current.active = false;
          drag.current.moved = false;
          trackRef.current?.classList.remove("is-dragging");
        }}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            e.stopPropagation();
            drag.current.moved = false;
          }
        }}
      >
        {children}
      </div>
      {right && (
        <button
          type="button"
          className="carousel-arrow carousel-arrow-right"
          aria-label={`Next ${label}`}
          onClick={() => move(1)}
        >
          <ChevronRight size={19} />
        </button>
      )}
    </div>
  );
}
