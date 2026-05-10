import { useState, useRef, useEffect, type RefObject } from "react";

const PEEK_HEIGHT = 80; // px of sheet visible above nav in peek state
const SNAP_THRESHOLD = 60; // px swipe to trigger snap

export function useBottomSheet(panelRef: RefObject<HTMLElement | null>) {
  const [isOpen, setIsOpen] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 809px)").matches;
    if (!isMobile) return;

    const handle = handleRef.current;
    const panel = panelRef.current;
    if (!handle || !panel) return;

    let startY = 0;
    let latestDelta = 0;

    function maxTranslate() {
      return panel!.offsetHeight - PEEK_HEIGHT;
    }

    function onTouchStart(e: TouchEvent) {
      startY = e.touches[0].clientY;
      latestDelta = 0;
      panel!.style.transition = "none";
    }

    function onTouchMove(e: TouchEvent) {
      latestDelta = e.touches[0].clientY - startY;
      const max = maxTranslate();
      const base = isOpenRef.current ? 0 : max;
      const clamped = Math.max(0, Math.min(max, base + latestDelta));
      panel!.style.transform = `translateY(${clamped}px)`;
    }

    function onTouchEnd() {
      panel!.style.transition = "";
      panel!.style.transform = "";
      if (isOpenRef.current) {
        if (latestDelta > SNAP_THRESHOLD) setIsOpen(false);
      } else {
        // tap (tiny delta) or sufficient upward swipe → open
        if (latestDelta < -SNAP_THRESHOLD || Math.abs(latestDelta) < 10) {
          setIsOpen(true);
        }
      }
    }

    handle.addEventListener("touchstart", onTouchStart, { passive: true });
    handle.addEventListener("touchmove", onTouchMove, { passive: true });
    handle.addEventListener("touchend", onTouchEnd);

    return () => {
      handle.removeEventListener("touchstart", onTouchStart);
      handle.removeEventListener("touchmove", onTouchMove);
      handle.removeEventListener("touchend", onTouchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { handleRef, isOpen, setIsOpen };
}
