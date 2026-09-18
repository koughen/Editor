import { audioWavBytes } from "opencut-wasm";
import type { PluginInsert } from "./types";
export type Invoke = <T>(
	command: string,
	args?: Record<string, unknown>,
) => Promise<T>;
export function audioDesktop(): Invoke | undefined {
	return typeof window === "undefined"
		? undefined
		: (window as Window & { __TAURI_INTERNALS__?: { invoke: Invoke } })
				.__TAURI_INTERNALS__?.invoke;
}
export interface NativePlugin {
	id: string;
	name: string;
	manufacturer: string;
}
export interface PluginParameter {
	id: string;
	name: string;
	min: number;
	max: number;
	value: number;
	unit: string;
	values: string[];
}
export async function renderNativeInserts({
	buffer,
	inserts,
	context,
}: {
	buffer: AudioBuffer;
	inserts: PluginInsert[];
	context: BaseAudioContext;
}): Promise<AudioBuffer> {
	if (!inserts.some((p) => !p.bypass)) return buffer;
	const invoke = audioDesktop();
	if (!invoke)
		throw new Error(
			"This mix uses Audio Units. Open it in the macOS app to render plug-ins, or bypass them.",
		);
	const ticket = await invoke<string>("begin_audio_render");
	try {
		const wav = audioWavBytes(
			buffer.getChannelData(0),
			buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)),
			buffer.sampleRate,
			32,
		);
		for (let offset = 0; offset < wav.length; offset += 262144)
			await invoke("write_audio_render", {
				ticket,
				offset,
				bytes: Array.from(wav.subarray(offset, offset + 262144)),
			});
		const size = await invoke<number>("render_audio_plugins", {
			ticket,
			inserts,
		});
		const bytes = new Uint8Array(size);
		for (let offset = 0; offset < size; offset += 524288) {
			const chunk = await invoke<ArrayBuffer | number[]>("read_audio_render", {
				ticket,
				offset,
			});
			bytes.set(new Uint8Array(chunk), offset);
		}
		return await context.decodeAudioData(bytes.buffer);
	} finally {
		await invoke("finish_audio_render", { ticket }).catch(() => {});
	}
}
