import { test, expect } from "bun:test";
import { colorMonitorTracks } from "./monitor-store";
import type { SceneTracks, VideoElement } from "@/timeline";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";

test("monitor bypass and highlight never mutate saved grades or export tracks", () => {
	const clip: VideoElement = {
		id: "clip",
		name: "Test",
		type: "video",
		mediaId: "media",
		startTime: ZERO_MEDIA_TIME,
		duration: mediaTime({ ticks: 30000 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		transform: { scaleX: 1, scaleY: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
		effects: [
			{ id: "blur", type: "gaussian-blur", enabled: true, params: {} },
			{
				id: "primary",
				type: "color-grade",
				enabled: true,
				params: { exposure: 1 },
			},
			{
				id: "secondary",
				type: "color-grade",
				enabled: true,
				params: { exposure: 0.5 },
			},
		],
	};
	const tracks: SceneTracks = {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			elements: [clip],
			muted: false,
			hidden: false,
		},
		overlay: [],
		audio: [],
	};
	const snapshot = structuredClone(tracks);
	const monitor = {
		elementId: "clip",
		nodeId: "primary",
		bypass: true,
		matte: false,
	};
	const bypassed = colorMonitorTracks({ tracks, monitor }).main
		.elements[0] as VideoElement;
	expect(bypassed.effects?.map((e) => e.enabled)).toEqual([true, false, false]);
	const highlighted = colorMonitorTracks({
		tracks,
		monitor: { ...monitor, bypass: false, matte: true },
	}).main.elements[0] as VideoElement;
	expect(highlighted.effects?.length).toBe(2);
	expect(highlighted.effects?.[1].params.monitorMatte).toBe(1);
	expect(tracks).toEqual(snapshot);
	expect(
		colorMonitorTracks({ tracks, monitor: { ...monitor, bypass: false } }),
	).toBe(tracks);
});
