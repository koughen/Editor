import { describe, expect, test } from "bun:test";
import { getMixPreset, isChannelAudible, resolveMix } from "../settings";
import {
	buildAudioGainAutomation,
	resolveEffectiveAudioGain,
} from "@/timeline/audio-state";
import {
	updateTrackInSceneTracks,
	type SceneTracks,
	type AudioElement,
} from "@/timeline";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { buildSeparatedAudioElement } from "@/timeline/audio-separation";

const tracks: SceneTracks = {
	main: {
		id: "main",
		type: "video",
		name: "Video",
		elements: [],
		muted: false,
		hidden: false,
	},
	overlay: [],
	audio: [
		{
			id: "voice",
			type: "audio",
			name: "Voice",
			elements: [],
			muted: false,
			solo: true,
		},
		{ id: "music", type: "audio", name: "Music", elements: [], muted: false },
	],
};
const clip: AudioElement = {
	id: "clip",
	name: "Clip",
	type: "audio",
	sourceType: "library",
	sourceUrl: "test.wav",
	volume: -6,
	startTime: ZERO_MEDIA_TIME,
	trimStart: ZERO_MEDIA_TIME,
	trimEnd: ZERO_MEDIA_TIME,
	duration: mediaTimeFromSeconds({ seconds: 4 }),
	fadeIn: 1,
	fadeOut: 1,
};

describe("audio mixer integration", () => {
	test("extracting source audio preserves its fade lengths", () => {
		const separated = buildSeparatedAudioElement({
			sourceElement: {
				id: "video",
				type: "video",
				name: "Video",
				mediaId: "media",
				volume: 0,
				startTime: ZERO_MEDIA_TIME,
				trimStart: ZERO_MEDIA_TIME,
				trimEnd: ZERO_MEDIA_TIME,
				duration: mediaTimeFromSeconds({ seconds: 4 }),
				fadeIn: 1,
				fadeOut: 2,
				transform: {
					scaleX: 1,
					scaleY: 1,
					position: { x: 0, y: 0 },
					rotate: 0,
				},
				opacity: 1,
			},
		});
		expect(separated.fadeIn).toBe(1);
		expect(separated.fadeOut).toBe(2);
	});
	test("old projects receive neutral defaults and malformed numeric values are bounded", () => {
		expect(resolveMix({}).gainDb).toBe(0);
		expect(
			resolveMix({ settings: { pan: 100, gainDb: Number.NaN } }),
		).toMatchObject({ pan: 1, gainDb: 0 });
	});
	test("solo mutes video and other audio channels, and mute wins over solo", () => {
		expect(isChannelAudible({ track: tracks.main, tracks })).toBe(false);
		expect(isChannelAudible({ track: tracks.audio[0], tracks })).toBe(true);
		expect(isChannelAudible({ track: tracks.audio[1], tracks })).toBe(false);
		expect(
			isChannelAudible({ track: { ...tracks.audio[0], muted: true }, tracks }),
		).toBe(false);
	});
	test("fades multiply clip volume and end at silence in scheduled playback", () => {
		expect(resolveEffectiveAudioGain({ element: clip, localTime: 0 })).toBe(0);
		expect(
			resolveEffectiveAudioGain({ element: clip, localTime: 0.5 }),
		).toBeCloseTo(0.2505936, 5);
		const points = buildAudioGainAutomation({
			element: clip,
			fromLocalTime: 3.5,
			toLocalTime: 4,
		});
		expect(points[0].gain).toBeCloseTo(0.2505936, 5);
		expect(points.at(-1)?.gain).toBe(0);
	});
	test("track updates and JSON persistence retain master and channel settings", () => {
		const source = { ...tracks, audioMaster: getMixPreset({ name: "warm" }) };
		const edited = updateTrackInSceneTracks({
			tracks: source,
			trackId: "music",
			update: (track) => ({
				...track,
				audioMix: getMixPreset({ name: "voice" }),
			}),
		});
		const restored = JSON.parse(JSON.stringify(edited));
		expect(restored.audioMaster.lowGain).toBe(3);
		expect(restored.audio[1].audioMix.compressorEnabled).toBe(true);
		expect(source.audio[1].audioMix).toBeUndefined();
	});
});

test("advanced state remains plain JSON and preserves automation identities", () => {
	const mix = resolveMix({
		settings: {
			automation: {
				pan: [
					{ id: "b", time: 2, value: 1 },
					{ id: "a", time: 0, value: -1 },
				],
			},
			bands: [
				{
					id: "eq1",
					kind: "notch",
					frequency: 4000,
					gain: 0,
					q: 4,
					enabled: true,
				},
			],
			plugins: [
				{
					instanceId: "p1",
					id: "test",
					name: "Test",
					parameters: { "0": 25 },
					bypass: false,
				},
			],
		},
	});
	expect(mix.automation).not.toBeInstanceOf(Map);
	const loaded = resolveMix({ settings: JSON.parse(JSON.stringify(mix)) });
	expect(loaded.automation.pan.map((p) => p.id)).toEqual(["a", "b"]);
	expect(loaded.plugins[0].parameters["0"]).toBe(25);
	expect(loaded.bands[0].id).toBe("eq1");
});
test("group solo and mute are reflected in channel audibility", () => {
	const grouped: SceneTracks = {
		...tracks,
		audio: tracks.audio.map((t) => ({
			...t,
			solo: false,
			audioMix: { outputId: t.id === "music" ? "group" : "master" },
		})),
		audioBuses: [
			{ id: "group", name: "Music", kind: "group", muted: false, solo: true },
		],
	};
	expect(isChannelAudible({ track: grouped.audio[1], tracks: grouped })).toBe(
		true,
	);
	expect(isChannelAudible({ track: grouped.audio[0], tracks: grouped })).toBe(
		false,
	);
	if (grouped.audioBuses) grouped.audioBuses[0].muted = true;
	expect(isChannelAudible({ track: grouped.audio[1], tracks: grouped })).toBe(
		false,
	);
});
