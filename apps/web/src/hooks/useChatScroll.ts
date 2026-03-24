/**
 * useChatScroll — pointer-aware auto-scroll for virtualized chat.
 *
 * Problem: Virtuoso's built-in `followOutput` + `atBottomStateChange` only
 * uses distance-from-bottom to decide whether to auto-scroll. This fails when:
 * - User scrolls up to read → new content shifts viewport → jarring
 * - User is mid-wheel-scroll near bottom → auto-scroll fights user input
 * - Content insertion above viewport shifts scroll position
 *
 * Solution: Track pointer/wheel/touch interaction state. When the user is
 * actively interacting (or recently interacted by scrolling up), suppress
 * auto-scroll regardless of distance from bottom. This gives the user clear
 * control: scroll up = "I'm reading, leave me alone". Click the button or
 * scroll to bottom = "follow new content again".
 *
 * Usage with react-virtuoso:
 * ```tsx
 * const { followOutput, handleAtBottom, showScrollButton, scrollToBottom, containerProps } =
 *   useChatScroll(virtuosoRef);
 *
 * <div {...containerProps}>
 *   <Virtuoso followOutput={followOutput} atBottomStateChange={handleAtBottom} ... />
 * </div>
 * ```
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

/**
 * How long after the last pointer/wheel/touch event to still consider the user
 * as "actively interacting". Prevents auto-scroll from kicking in the instant
 * a wheel event stops firing.
 */
const INTERACTION_COOLDOWN_MS = 150;

export interface ChatScrollResult {
	/** Pass to Virtuoso's `followOutput` prop. */
	followOutput: (isAtBottom: boolean) => false | "smooth" | "auto";
	/** Pass to Virtuoso's `atBottomStateChange` prop. */
	handleAtBottom: (atBottom: boolean) => void;
	/** Whether to show the "scroll to bottom" button. */
	showScrollButton: boolean;
	/** Smooth-scroll to the bottom and re-enable auto-follow. */
	scrollToBottom: () => void;
	/**
	 * Spread onto the scroll container's parent div to capture pointer events.
	 * Uses event delegation so we don't need refs to Virtuoso's internal scroller.
	 */
	containerProps: {
		onPointerDown: () => void;
		onPointerUp: () => void;
		onWheel: () => void;
		onTouchStart: () => void;
		onTouchEnd: () => void;
	};
}

export function useChatScroll(virtuosoRef: RefObject<VirtuosoHandle | null>): ChatScrollResult {
	/**
	 * True when the user has intentionally scrolled away from bottom.
	 * This is the primary gate for auto-scroll. It's set when:
	 * - Virtuoso reports atBottom=false AND the user is interacting
	 * Cleared when:
	 * - User clicks "scroll to bottom" button
	 * - Virtuoso reports atBottom=true (user scrolled back down naturally)
	 */
	const userScrolledAwayRef = useRef(false);

	/**
	 * True when pointer/wheel/touch is actively happening.
	 * Used to distinguish "user scrolled away" from "content grew and pushed us away".
	 */
	const isInteractingRef = useRef(false);

	/** Timer for interaction cooldown. */
	const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/** Whether Virtuoso thinks we're at the bottom. */
	const isAtBottomRef = useRef(true);

	const [showScrollButton, setShowScrollButton] = useState(false);

	// Cleanup cooldown timer on unmount
	useEffect(() => {
		return () => {
			if (cooldownTimerRef.current) {
				clearTimeout(cooldownTimerRef.current);
			}
		};
	}, []);

	// ── Interaction tracking ─────────────────────────────────────────

	const startInteraction = useCallback(() => {
		isInteractingRef.current = true;
		if (cooldownTimerRef.current) {
			clearTimeout(cooldownTimerRef.current);
			cooldownTimerRef.current = null;
		}
	}, []);

	const endInteraction = useCallback(() => {
		// Don't immediately clear — use cooldown to handle rapid events
		if (cooldownTimerRef.current) {
			clearTimeout(cooldownTimerRef.current);
		}
		cooldownTimerRef.current = setTimeout(() => {
			isInteractingRef.current = false;
			cooldownTimerRef.current = null;
		}, INTERACTION_COOLDOWN_MS);
	}, []);

	const onPointerDown = useCallback(() => {
		startInteraction();
	}, [startInteraction]);

	const onPointerUp = useCallback(() => {
		endInteraction();
	}, [endInteraction]);

	const onWheel = useCallback(() => {
		// Wheel events fire continuously — treat each as start+end
		startInteraction();
		endInteraction();
	}, [startInteraction, endInteraction]);

	const onTouchStart = useCallback(() => {
		startInteraction();
	}, [startInteraction]);

	const onTouchEnd = useCallback(() => {
		endInteraction();
	}, [endInteraction]);

	// ── Virtuoso callbacks ───────────────────────────────────────────

	const handleAtBottom = useCallback((atBottom: boolean) => {
		isAtBottomRef.current = atBottom;

		if (atBottom) {
			// User reached the bottom — clear the "scrolled away" flag
			userScrolledAwayRef.current = false;
			setShowScrollButton(false);
		} else if (isInteractingRef.current) {
			// User is interacting AND not at bottom → they scrolled up intentionally
			userScrolledAwayRef.current = true;
			setShowScrollButton(true);
		}
		// If not at bottom but NOT interacting → content grew and pushed us up.
		// Don't set userScrolledAway. Let followOutput handle it.
	}, []);

	const followOutput = useCallback((isAtBottom: boolean): false | "smooth" | "auto" => {
		// If user has intentionally scrolled away, never auto-scroll
		if (userScrolledAwayRef.current) {
			return false;
		}

		// If user is actively scrolling/touching, don't fight them
		if (isInteractingRef.current) {
			return false;
		}

		// At bottom with no user interaction → follow smoothly
		if (isAtBottom) {
			return "smooth";
		}

		// Not at bottom, but user hasn't scrolled away and isn't interacting.
		// This happens when content insertion shifts us slightly off bottom.
		// Use "auto" (instant) to snap back without visible jank.
		return "auto";
	}, []);

	const scrollToBottom = useCallback(() => {
		// Clear all scroll-away state
		userScrolledAwayRef.current = false;
		isInteractingRef.current = false;
		if (cooldownTimerRef.current) {
			clearTimeout(cooldownTimerRef.current);
			cooldownTimerRef.current = null;
		}

		setShowScrollButton(false);

		virtuosoRef.current?.scrollToIndex({
			index: "LAST",
			behavior: "smooth",
		});
	}, [virtuosoRef]);

	return {
		followOutput,
		handleAtBottom,
		showScrollButton,
		scrollToBottom,
		containerProps: {
			onPointerDown,
			onPointerUp,
			onWheel,
			onTouchStart,
			onTouchEnd,
		},
	};
}
