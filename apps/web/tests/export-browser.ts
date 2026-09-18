// Browser integration checks: actual GPU frames, WebCodecs output and cancellation.
import {
	Input,
	BufferSource,
	ALL_FORMATS,
	CanvasSink,
	canEncodeVideo,
	canEncodeAudio,
} from "mediabunny";
import { SceneExporter } from "../src/services/renderer/scene-exporter";
import { RootNode } from "../src/services/renderer/nodes/root-node";
import { ImageNode } from "../src/services/renderer/nodes/image-node";
import { resolveSettings } from "../src/export/settings";
import type { ExportOptions } from "../src/export";
import { buildProjectHandoff, initializeGpu } from "opencut-wasm";

const results: string[] = [];
function report(message: string) {
	document.querySelector("pre")!.textContent = [...results, message].join("\n");
	if (location.search.includes("report=1"))
		void fetch("/results", { method: "POST", body: message }).catch(() => {});
}
function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message);
}
async function check(name: string, run: () => Promise<void>) {
	try {
		report(`RUN ${name}`);
		await Promise.race([
			run(),
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error("Check timed out after 20 seconds")),
					20000,
				),
			),
		]);
		results.push(`PASS ${name}`);
	} catch (error) {
		results.push(`FAIL ${name}: ${String(error)}`);
	}
	report(results[results.length - 1]);
}
function scene() {
	const root = new RootNode({ duration: 240000 });
	for (const [index, color] of ["#ff0000", "#0000ff"].entries()) {
		const image = document.createElement("canvas");
		image.width = 320;
		image.height = 180;
		const ctx = image.getContext("2d")!;
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, 320, 180);
		root.add(
			new ImageNode({
				url: image.toDataURL(),
				timeOffset: index * 120000,
				duration: 120000,
				trimStart: 0,
				trimEnd: 0,
				opacity: 1,
				transform: {
					scaleX: 1,
					scaleY: 1,
					position: { x: 0, y: 0 },
					rotate: 0,
				},
			}),
		);
	}
	return root;
}
function settings(options: Partial<ExportOptions> = {}) {
	return resolveSettings({
		options: {
			format: "mp4",
			quality: "high",
			hardwareAcceleration: "no-preference",
			includeAudio: false,
			width: 160,
			height: 160,
			rangeStart: 120000,
			rangeEnd: 240000,
			...options,
		},
		duration: 240000,
		projectSettings: {
			canvasSize: { width: 320, height: 180 },
			fps: { numerator: 30000, denominator: 1001 },
			background: { type: "color", color: "#000000" },
		},
	});
}
await check("GPU compositor initializes", async () => {
	await initializeGpu();
});
await check(
	"MP4 range starts on blue clip, resizes with letterboxing and keeps final frame",
	async () => {
		assert(await canEncodeVideo("avc"), "H.264 encoder unavailable");
		const s = settings();
		const exporter = new SceneExporter({
			sourceWidth: 320,
			sourceHeight: 180,
			settings: s,
		});
		exporter.on("progress", (progress) =>
			report(`Encoded ${Math.round(progress * 100)}%`),
		);
		const buffer = await exporter.export({ rootNode: scene() });
		report("Encoded file ready; decoding");
		assert(buffer, "No encoded video");
		const input = new Input({
			source: new BufferSource(buffer),
			formats: ALL_FORMATS,
		});
		try {
			const video = await input.getPrimaryVideoTrack();
			assert(video, "No video track");
			assert(
				video.displayWidth === 160 && video.displayHeight === 160,
				"Output dimensions were ignored",
			);
			assert(video.codec === "avc", "Wrong codec");
			const duration = await input.computeDuration();
			assert(
				duration >= 1 && duration < 1.04,
				`Unexpected duration ${duration}`,
			);
			const sink = new CanvasSink(video);
			const frame = await sink.getCanvas(0);
			assert(frame, "No first frame");
			const ctx = frame.canvas.getContext("2d");
			assert(ctx && "getImageData" in ctx, "Decoded frame has no 2D context");
			const center = ctx.getImageData(80, 80, 1, 1).data;
			const border = ctx.getImageData(80, 2, 1, 1).data;
			assert(center[2] > 150 && center[0] < 80, `Wrong range/color: ${center}`);
			assert(
				border[0] < 25 && border[1] < 25 && border[2] < 25,
				"Letterbox is not black",
			);
			assert(await sink.getCanvas(0.99), "Final partial frame was omitted");
		} finally {
			input.dispose();
		}
	},
);
await check(
	"AAC audio uses requested mono channel and 48 kHz sample rate",
	async () => {
		assert(await canEncodeAudio("aac"), "AAC encoder unavailable");
		const audio = new AudioBuffer({
			numberOfChannels: 1,
			length: 48000,
			sampleRate: 48000,
		});
		for (let i = 0; i < audio.length; i++)
			audio.getChannelData(0)[i] = 0.2 * Math.sin((i / 48000) * Math.PI * 880);
		const exporter = new SceneExporter({
			sourceWidth: 320,
			sourceHeight: 180,
			settings: settings({
				includeAudio: true,
				audioChannels: 1,
				audioBitrate: 128000,
			}),
			audioBuffer: audio,
		});
		const buffer = await exporter.export({ rootNode: scene() });
		assert(buffer, "No output");
		const input = new Input({
			source: new BufferSource(buffer),
			formats: ALL_FORMATS,
		});
		try {
			const track = await input.getPrimaryAudioTrack();
			assert(track, "No audio");
			assert(track.numberOfChannels === 1, "Expected mono");
			assert(track.sampleRate === 48000, "Wrong sample rate");
			assert(track.codec === "aac", "Wrong audio codec");
		} finally {
			input.dispose();
		}
	},
);
await check("Cancellation produces no downloadable result", async () => {
	const exporter = new SceneExporter({
		sourceWidth: 320,
		sourceHeight: 180,
		settings: settings(),
	});
	exporter.on("progress", () => exporter.cancel());
	assert(
		(await exporter.export({ rootNode: scene() })) === null,
		"Cancelled export still produced a file",
	);
});
await check(
	"WASM produces all four destination packages with transfer notes",
	async () => {
		for (const target of ["premiere", "resolve", "after-effects", "capcut"]) {
			const plan = JSON.parse(
				buildProjectHandoff(
					JSON.stringify({
						target,
						mode: "appearance",
						media: [],
						project: {
							metadata: { name: "Browser check" },
							settings: {
								canvasSize: { width: 320, height: 180 },
								fps: { numerator: 30, denominator: 1 },
							},
						},
						scene: {
							tracks: {
								main: { elements: [] },
								overlay: [
									{
										elements: [
											{
												id: "t",
												type: "text",
												content: "Export",
												startTime: 0,
												duration: 120000,
											},
										],
									},
								],
								audio: [],
							},
						},
					}),
				),
			);
			assert(
				plan.files.some(
					(f: { path: string }) => f.path === "source-project.json",
				),
				"Missing original settings",
			);
			assert(plan.warnings.length > 0, "Missing fidelity notes");
			assert(plan.needsRender, "Appearance mode should render");
		}
	},
);
const failed = results.filter((r) => r.startsWith("FAIL")).length;
document.title = failed
	? `Export checks: ${failed} failed`
	: `Export checks: ${results.length} passed`;
document.querySelector("h1")!.textContent = document.title;
