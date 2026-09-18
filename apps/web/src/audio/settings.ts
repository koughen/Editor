import { normalizeAudioMix, audioMixPreset, audioRouting } from "opencut-wasm";
import type { AudioMixSettings } from "./types";
import type { AudioTrack, VideoTrack, SceneTracks } from "@/timeline";

export function resolveMix({
	settings,
}: {
	settings?: Partial<AudioMixSettings>;
}): AudioMixSettings {
	return normalizeAudioMix(settings ?? {}) as AudioMixSettings;
}

export function getMixPreset({ name }: { name: string }): AudioMixSettings {
	return audioMixPreset(name) as AudioMixSettings;
}

export function getAudioTracks({
	tracks,
}: {
	tracks: SceneTracks;
}): (AudioTrack | VideoTrack)[] {
	return [
		...tracks.overlay.filter((t): t is VideoTrack => t.type === "video"),
		tracks.main,
		...tracks.audio,
	];
}

export function isChannelAudible({
	track,
	tracks,
}: {
	track: AudioTrack | VideoTrack;
	tracks: SceneTracks;
}): boolean {
	const channels = [
		...getAudioTracks({ tracks }).map((original) => {
			const t = original.id === track.id ? track : original;
			return {
				id: t.id,
				kind: "track",
				muted: t.muted,
				solo: t.solo ?? false,
				settings: resolveMix({ settings: t.audioMix }),
			};
		}),
		...(tracks.audioBuses ?? []).map((b) => ({
			id: b.id,
			kind: b.kind,
			muted: b.muted,
			solo: b.solo,
			settings: resolveMix({ settings: b.audioMix }),
		})),
	];
	return (
		(audioRouting(channels) as { id: string; audible: boolean }[]).find(
			(c) => c.id === track.id,
		)?.audible ?? false
	);
}
