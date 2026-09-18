import { resolveExportSettings } from "opencut-wasm";
import type { ExportOptions } from "./index";
import type { TProjectSettings } from "@/project/types";
import type { FrameRate } from "opencut-wasm";

export interface ResolvedExportSettings {
	format: "mp4" | "webm";
	codec: "avc" | "hevc" | "vp9" | "av1";
	width: number;
	height: number;
	fps: FrameRate;
	videoBitrate: number;
	bitrateMode: "constant" | "variable";
	keyFrameInterval: number;
	hardwareAcceleration: "no-preference" | "prefer-hardware" | "prefer-software";
	includeAudio: boolean;
	audioCodec: "aac" | "opus";
	audioBitrate: number;
	audioSampleRate: number;
	audioChannels: number;
	startTicks: number;
	endTicks: number;
	frameCount: number;
	fit: "contain" | "cover" | "stretch";
	estimatedBytes: number;
}
export function resolveSettings({
	options,
	projectSettings,
	duration,
}: {
	options: ExportOptions;
	projectSettings: TProjectSettings;
	duration: number;
}): ResolvedExportSettings {
	return JSON.parse(
		resolveExportSettings(
			JSON.stringify({ options, projectSettings, duration }),
		),
	);
}
