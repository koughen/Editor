import { audioCleanupParameters } from "opencut-wasm";
import type { AudioMixSettings, LoudnessReading } from "./types";
type Context = AudioContext | OfflineAudioContext;
let modulePromise: Promise<WebAssembly.Module> | undefined;
const initialized = new WeakMap<Context, Promise<void>>();
let compiled: WebAssembly.Module | undefined;
export async function initializeAudioProcessing({
	context,
}: {
	context: Context;
}) {
	let promise = initialized.get(context);
	if (!promise) {
		promise = (async () => {
			modulePromise ??= fetch("/audio/processor.wasm")
				.then(async (r) => {
					if (!r.ok) throw new Error("Audio processor could not load");
					return WebAssembly.compile(await r.arrayBuffer());
				})
				.catch((e) => {
					modulePromise = undefined;
					throw e;
				});
			compiled = await modulePromise;
			await context.audioWorklet.addModule("/audio/processor.js");
		})();
		initialized.set(context, promise);
	}
	try {
		await promise;
	} catch (error) {
		initialized.delete(context);
		throw error;
	}
}
export const SILENT_LOUDNESS: LoudnessReading = {
	integrated: null,
	momentary: null,
	shortTerm: null,
	range: null,
	truePeak: null,
	seconds: 0,
};
export function createProcessor({
	context,
	settings,
	meter = false,
}: {
	context: Context;
	settings?: AudioMixSettings;
	meter?: boolean;
}): AudioWorkletNode | null {
	if (!compiled || !initialized.has(context)) return null;
	return new AudioWorkletNode(context, "editor-audio", {
		numberOfInputs: meter ? 1 : 2,
		numberOfOutputs: 1,
		outputChannelCount: [2],
		channelCount: 2,
		processorOptions: {
			module: compiled,
			meter,
			parameters: settings
				? audioCleanupParameters(settings.cleanup, settings.bypass)
				: undefined,
		},
	});
}
export function readLoudnessMessage({
	data,
}: {
	data: number[];
}): LoudnessReading {
	const n = (i: number) => (Number.isFinite(data[i]) ? data[i] : null);
	return {
		integrated: n(0),
		momentary: n(1),
		shortTerm: n(2),
		range: n(3),
		truePeak: n(4),
		seconds: data[5] || 0,
	};
}
export async function flushProcessor({
	node,
}: {
	node: AudioWorkletNode | null;
}): Promise<void> {
	if (!node) return;
	await new Promise<void>((resolve, reject) => {
		const sync = crypto.randomUUID();
		const timer = setTimeout(() => {
			node.port.removeEventListener("message", receive);
			reject(new Error("Audio processor did not initialize"));
		}, 5000);
		const receive = (event: MessageEvent) => {
			if (event.data?.sync === sync) {
				clearTimeout(timer);
				node.port.removeEventListener("message", receive);
				resolve();
			}
		};
		node.port.addEventListener("message", receive);
		node.port.start();
		node.port.postMessage({ sync });
	});
}
