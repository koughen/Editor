import {
	AudioLoudness,
	audioWavBytes,
	audioNormalizationGain,
	safeExportFileName,
} from "opencut-wasm";
import { zipSync } from "fflate";
import { createTimelineAudioBuffer } from "@/media/audio";
import type { SceneTracks } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import type { LoudnessReading } from "./types";
import { audioDesktop } from "./native";
import { getAudioTracks } from "./settings";
export async function analyzeAudio({
	buffer,
	signal,
}: {
	buffer: AudioBuffer;
	signal?: AbortSignal;
}): Promise<LoudnessReading> {
	const meter = new AudioLoudness(buffer.sampleRate);
	try {
		for (let offset = 0; offset < buffer.length; offset += 48000) {
			signal?.throwIfAborted();
			meter.add(
				buffer.getChannelData(0).subarray(offset, offset + 48000),
				buffer
					.getChannelData(Math.min(1, buffer.numberOfChannels - 1))
					.subarray(offset, offset + 48000),
			);
			if (offset % (48000 * 10) === 0)
				await new Promise((r) => setTimeout(r, 0));
		}
		return meter.reading() as LoudnessReading;
	} finally {
		meter.free();
	}
}
export async function exportAudio({
	tracks,
	mediaAssets,
	duration,
	name,
	sampleRate,
	bits,
	tailSeconds,
	stems,
	target,
	signal,
	onProgress,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	duration: number;
	name: string;
	sampleRate: number;
	bits: number;
	tailSeconds: number;
	stems: boolean;
	target: number | null;
	signal: AbortSignal;
	onProgress: (message: string) => void;
}): Promise<string> {
	const entries: Record<string, Uint8Array> = {};
	const reports: { name: string; loudness: LoudnessReading; gainDb: number }[] =
		[];
	const channels = getAudioTracks({ tracks }).filter((t) =>
		t.elements.some((e) => e.type === "audio" || e.type === "video"),
	);
	const jobs: [string, string[] | undefined][] = [
		["Stereo mix", undefined],
		...(stems
			? channels.map((t) => [t.name, [t.id]] as [string, string[]])
			: []),
	];
	if (stems)
		for (const bus of tracks.audioBuses ?? []) {
			if (bus.kind !== "group") continue;
			const ids = channels
				.filter((t) => t.audioMix?.outputId === bus.id)
				.map((t) => t.id);
			if (ids.length) jobs.push([`${bus.name} (group)`, ids]);
		}
	const invoke = audioDesktop();
	let ticket: string | undefined;
	try {
		if (invoke)
			ticket = await invoke<string>("begin_handoff", { name: `${name} Audio` });
		for (let i = 0; i < jobs.length; i++) {
			signal.throwIfAborted();
			const [label, ids] = jobs[i];
			onProgress(`Rendering ${i + 1}/${jobs.length} · ${label}`);
			const buffer = await createTimelineAudioBuffer({
				tracks,
				mediaAssets,
				duration,
				sampleRate,
				tailSeconds,
				stemTrackIds: ids,
				includeMaster: !ids,
				signal,
			});
			if (!buffer) throw new Error("No audio is available to export.");
			signal.throwIfAborted();
			onProgress(`Measuring ${label}`);
			let loudness = await analyzeAudio({ buffer, signal });
			let gainDb = 0;
			// Individual stems preserve their mix balance; normalize the combined mix only.
			if (
				target !== null &&
				!ids &&
				loudness.integrated !== null &&
				loudness.truePeak !== null
			) {
				gainDb = audioNormalizationGain(
					loudness.integrated,
					loudness.truePeak,
					target,
					-1,
				);
				const gain = 10 ** (gainDb / 20);
				for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
					const data = buffer.getChannelData(ch);
					for (let j = 0; j < data.length; j++) data[j] *= gain;
				}
				loudness = await analyzeAudio({ buffer, signal });
			}
			const filename = `${String(i).padStart(2, "0")} ${safeExportFileName(label)}.wav`;
			const bytes = audioWavBytes(
				buffer.getChannelData(0),
				buffer.getChannelData(1),
				buffer.sampleRate,
				bits,
			);
			reports.push({ name: filename, loudness, gainDb });
			if (invoke && ticket) {
				for (let offset = 0; offset < bytes.length; offset += 262144) {
					signal.throwIfAborted();
					await invoke("write_handoff_file", {
						ticket,
						path: filename,
						offset,
						bytes: Array.from(bytes.subarray(offset, offset + 262144)),
					});
				}
			} else entries[filename] = new Uint8Array(bytes);
		}
		const notes = new TextEncoder().encode(
			JSON.stringify(
				{
					sampleRate,
					bits,
					tailSeconds,
					stems:
						"Stems preserve timeline alignment, track/group effects, sends and sidechain triggers. Master processing is omitted. Shared nonlinear effects can make recombined stems differ from the stereo mix.",
					reports,
				},
				null,
				2,
			),
		);
		if (invoke && ticket) {
			await invoke("write_handoff_file", {
				ticket,
				path: "Mix report.json",
				offset: 0,
				bytes: Array.from(notes),
			});
			signal.throwIfAborted();
			const path = await invoke<string>("finish_audio_export", { ticket });
			ticket = undefined;
			return `Saved to ${path}`;
		}
		signal.throwIfAborted();
		const bytes = stems
			? zipSync({ ...entries, "Mix report.json": notes }, { level: 0 })
			: Object.values(entries)[0];
		const url = URL.createObjectURL(
			new Blob([new Uint8Array(bytes)], {
				type: stems ? "application/zip" : "audio/wav",
			}),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${safeExportFileName(name)}${stems ? " stems.zip" : ".wav"}`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 30000);
		return "Audio download is ready.";
	} finally {
		if (ticket && invoke)
			await invoke("cancel_handoff", { ticket }).catch(() => {});
	}
}
