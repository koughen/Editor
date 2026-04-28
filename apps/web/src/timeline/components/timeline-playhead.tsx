"use client";

import { useRef } from "react";
import {
	getCenteredLineLeft,
	TIMELINE_INDICATOR_LINE_WIDTH_PX,
	timelineTimeToSnappedPixels,
} from "@/timeline";
import { useTimelinePlayhead } from "@/timeline/hooks/use-timeline-playhead";
import {
	addMediaTime,
	maxMediaTime,
	mediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { TIMELINE_SCROLLBAR_SIZE_PX } from "./layout";
import { TIMELINE_LAYERS } from "./layers";

interface TimelinePlayheadProps {
	zoomLevel: number;
	hasHorizontalScrollbar: boolean;
	rulerRef: React.RefObject<HTMLDivElement | null>;
	rulerScrollRef: React.RefObject<HTMLDivElement | null>;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
	timelineRef: React.RefObject<HTMLDivElement | null>;
	playheadRef?: React.RefObject<HTMLDivElement | null>;
	isSnappingToPlayhead?: boolean;
}

export function TimelinePlayhead({
	zoomLevel,
	hasHorizontalScrollbar,
	rulerRef,
	rulerScrollRef,
	tracksScrollRef,
	timelineRef,
	playheadRef: externalPlayheadRef,
	isSnappingToPlayhead = false,
}: TimelinePlayheadProps) {
	const editor = useEditor();
	const duration = editor.timeline.getTotalDuration();
	const internalPlayheadRef = useRef<HTMLDivElement>(null);
	const playheadRef = externalPlayheadRef || internalPlayheadRef;

	const { handlePlayheadMouseDown } = useTimelinePlayhead({
		zoomLevel,
		rulerRef,
		rulerScrollRef,
		tracksScrollRef,
		playheadRef,
	});

	const timelineContainerHeight =
		timelineRef.current?.clientHeight ??
		tracksScrollRef.current?.clientHeight ??
		400;
	const totalHeight = Math.max(
		0,
		timelineContainerHeight -
			(hasHorizontalScrollbar ? TIMELINE_SCROLLBAR_SIZE_PX - 5 : 0),
	);

	const currentTime = editor.playback.getCurrentTime();
	const centerPosition = timelineTimeToSnappedPixels({
		time: currentTime,
		zoomLevel,
	});
	const scrollLeft = tracksScrollRef.current?.scrollLeft ?? 0;
	const leftPosition =
		getCenteredLineLeft({ centerPixel: centerPosition }) - scrollLeft;

	const handlePlayheadKeyDown = (
		event: React.KeyboardEvent<HTMLDivElement>,
	) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

		event.preventDefault();
		const fps = editor.project.getActive().settings.fps;
		const ticksPerFrame = mediaTime({
			ticks: Math.round(
				(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
			),
		});
		const direction = event.key === "ArrowRight" ? 1 : -1;
		const now = editor.playback.getCurrentTime();
		const nextTime =
			direction > 0
				? addMediaTime({ a: now, b: ticksPerFrame })
				: subMediaTime({ a: now, b: ticksPerFrame });

		editor.playback.seek({
			time: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: duration < nextTime ? duration : nextTime,
			}),
		});
	};

	return (
		<div
			ref={playheadRef}
			role="slider"
			aria-label="Timeline playhead"
			aria-valuemin={0}
			aria-valuemax={duration}
			aria-valuenow={currentTime}
			tabIndex={0}
			className="pointer-events-none absolute"
			style={{
				left: `${leftPosition}px`,
				top: 0,
				height: `${totalHeight}px`,
				width: `${TIMELINE_INDICATOR_LINE_WIDTH_PX}px`,
				zIndex: TIMELINE_LAYERS.playhead,
			}}
			onKeyDown={handlePlayheadKeyDown}
		>
			<div className="bg-primary pointer-events-none absolute left-0 h-full w-0.5" />

			<button
				type="button"
				aria-label="Drag playhead"
				className={`pointer-events-auto absolute top-0.5 left-1/2 size-4 -translate-x-1/2 transform cursor-col-resize text-primary drop-shadow-xs ${isSnappingToPlayhead ? "" : "opacity-90"}`}
				onMouseDown={handlePlayheadMouseDown}
			>
				<svg
					viewBox="0 0 24 24"
					fill="currentColor"
					className="size-full"
					aria-hidden="true"
				>
					<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
				</svg>
			</button>
		</div>
	);
}
