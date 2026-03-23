/**
 * useAutoScroll — auto-scroll to bottom on content changes.
 *
 * Behavior:
 * - If user is at/near bottom: auto-scroll to stay at bottom on new content
 * - If user has scrolled up: don't auto-scroll, show "↓ New messages" button
 * - Clicking the button smooth-scrolls to bottom and hides it
 *
 * Uses useLayoutEffect for scroll-to-bottom (prevents flicker during streaming).
 * Uses passive scroll listener for tracking position (no jank).
 */

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Pixels from the bottom to still count as "at bottom". */
const SCROLL_THRESHOLD = 50;

export function useAutoScroll(
	containerRef: RefObject<HTMLDivElement | null>,
	contentDep: unknown,
): {
	showScrollButton: boolean;
	scrollToBottom: () => void;
} {
	const isAtBottomRef = useRef(true);
	const [showScrollButton, setShowScrollButton] = useState(false);

	// ── Track scroll position via passive scroll listener ─────────────
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const handleScroll = () => {
			const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
			isAtBottomRef.current = atBottom;
			if (atBottom) {
				setShowScrollButton(false);
			}
		};

		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			el.removeEventListener("scroll", handleScroll);
		};
	}, [containerRef]);

	// ── Auto-scroll after content changes (before paint) ─────────────
	// biome-ignore lint/correctness/useExhaustiveDependencies: contentDep is the intentional trigger for scroll updates
	useLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		if (isAtBottomRef.current) {
			el.scrollTop = el.scrollHeight;
		} else {
			// User is scrolled up — show the button (no-op if already true)
			setShowScrollButton(true);
		}
	}, [containerRef, contentDep]);

	// ── Manual scroll to bottom ──────────────────────────────────────
	const scrollToBottom = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		setShowScrollButton(false);
		isAtBottomRef.current = true;
	}, [containerRef]);

	return { showScrollButton, scrollToBottom };
}
