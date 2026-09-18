import EventEmitter from "eventemitter3";
import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
	AudioBufferSource,
	canEncodeVideo,
	canEncodeAudio,
} from "mediabunny";
import { TICKS_PER_SECOND } from "@/wasm";
import type { RootNode } from "./nodes/root-node";
import { CanvasRenderer } from "./canvas-renderer";
import type { ResolvedExportSettings } from "@/export/settings";

export type SceneExporterEvents = {
	progress: [progress: number];
	complete: [buffer: ArrayBuffer];
	error: [error: Error];
	cancelled: [];
};

/** Platform encoder adapter. Shared export policy is resolved by Rust. */
export class SceneExporter extends EventEmitter<SceneExporterEvents> {
	private renderer: CanvasRenderer;
	private isCancelled = false;
	private activeOutput: Output | null = null;
	private abortController = new AbortController();
	private async waitFor<T>(operation: Promise<T>): Promise<T> {
		this.abortController.signal.throwIfAborted();
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let onAbort: () => void = () => {};
		try {
			return await Promise.race([
				operation,
				new Promise<never>((_, reject) => {
					onAbort = () =>
						reject(new DOMException("Export cancelled", "AbortError"));
					this.abortController.signal.addEventListener("abort", onAbort, {
						once: true,
					});
					timeout = setTimeout(
						() =>
							reject(
								new Error(
									"The device encoder stopped responding. Try Prefer software, a different codec, or a lower resolution.",
								),
							),
						30000,
					);
				}),
			]);
		} finally {
			clearTimeout(timeout);
			this.abortController.signal.removeEventListener("abort", onAbort);
		}
	}
	constructor(
		private params: {
			sourceWidth: number;
			sourceHeight: number;
			settings: ResolvedExportSettings;
			audioBuffer?: AudioBuffer;
		},
	) {
		super();
		this.renderer = new CanvasRenderer({
			width: params.sourceWidth,
			height: params.sourceHeight,
			fps: params.settings.fps,
		});
	}
	cancel(): void {
		this.isCancelled = true;
		this.abortController.abort();
		void this.activeOutput?.cancel().catch(() => {});
	}
	async export({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		const { settings: s, audioBuffer, sourceWidth, sourceHeight } = this.params;
		const fps = s.fps.numerator / s.fps.denominator;
		// WebKit can stall its quality-mode encoder queue. Low-latency mode
		// avoids that queue; the packet count below still rejects dropped frames.
		const latencyMode =
			navigator.vendor === "Apple Computer, Inc." ? "realtime" : "quality";
		let encodedFrames = 0;
		if (
			!(await canEncodeVideo(s.codec, {
				width: s.width,
				height: s.height,
				bitrate: s.videoBitrate,
				bitrateMode: s.bitrateMode,
				hardwareAcceleration: s.hardwareAcceleration,
				latencyMode,
			}))
		) {
			throw new Error(
				`This device cannot encode ${s.codec.toUpperCase()} at ${s.width} × ${s.height} with these settings. Try H.264 / MP4 or VP9 / WebM, or lower the resolution.`,
			);
		}
		if (
			s.includeAudio &&
			audioBuffer &&
			!(await canEncodeAudio(s.audioCodec, {
				numberOfChannels: s.audioChannels,
				sampleRate: s.audioSampleRate,
				bitrate: s.audioBitrate,
			}))
		) {
			throw new Error(
				`${s.audioCodec.toUpperCase()} audio encoding is unavailable on this device. Try another format or turn off audio.`,
			);
		}
		const canvas = document.createElement("canvas");
		canvas.width = s.width;
		canvas.height = s.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Cannot create the export canvas.");
		const output = new Output({
			format:
				s.format === "webm"
					? new WebMOutputFormat()
					: new Mp4OutputFormat({ fastStart: "in-memory" }),
			target: new BufferTarget(),
		});
		const video = new CanvasSource(canvas, {
			codec: s.codec,
			bitrate: s.videoBitrate,
			bitrateMode: s.bitrateMode,
			keyFrameInterval: s.keyFrameInterval,
			hardwareAcceleration: s.hardwareAcceleration,
			latencyMode,
			onEncodedPacket: () => {
				encodedFrames++;
			},
		});
		this.activeOutput = output;
		output.addVideoTrack(video, { frameRate: fps });
		let audio: AudioBufferSource | undefined;
		if (s.includeAudio && audioBuffer) {
			audio = new AudioBufferSource({
				codec: s.audioCodec,
				bitrate: s.audioBitrate,
			});
			output.addAudioTrack(audio);
		}
		let finalized = false;
		try {
			await this.waitFor(output.start());
			if (this.isCancelled) {
				this.emit("cancelled");
				return null;
			}
			if (audio && audioBuffer) {
				await this.waitFor(audio.add(audioBuffer));
				audio.close();
			}
			for (let i = 0; i < s.frameCount; i++) {
				if (this.isCancelled) {
					this.emit("cancelled");
					return null;
				}
				// Compute from the rational rate for every frame; never accumulate rounded ticks.
				const time =
					s.startTicks +
					Math.round(
						(i * TICKS_PER_SECOND * s.fps.denominator) / s.fps.numerator,
					);
				await this.waitFor(this.renderer.render({ node: rootNode, time }));
				context.fillStyle = "#000000";
				context.fillRect(0, 0, s.width, s.height);
				const scale =
					s.fit === "cover"
						? Math.max(s.width / sourceWidth, s.height / sourceHeight)
						: Math.min(s.width / sourceWidth, s.height / sourceHeight);
				const dw = s.fit === "stretch" ? s.width : sourceWidth * scale;
				const dh = s.fit === "stretch" ? s.height : sourceHeight * scale;
				context.drawImage(
					this.renderer.getOutputCanvas(),
					(s.width - dw) / 2,
					(s.height - dh) / 2,
					dw,
					dh,
				);
				await this.waitFor(video.add(i / fps, 1 / fps));
				this.emit("progress", ((i + 1) / s.frameCount) * 0.98);
			}
			if (this.isCancelled) {
				this.emit("cancelled");
				return null;
			}
			video.close();
			await this.waitFor(output.finalize());
			finalized = true;
			if (encodedFrames !== s.frameCount) {
				throw new Error(
					`The encoder returned ${encodedFrames} of ${s.frameCount} frames. Try another encoder preference or a lower resolution.`,
				);
			}
			if (this.isCancelled) {
				this.emit("cancelled");
				return null;
			}
			const buffer = output.target.buffer;
			if (!buffer) throw new Error("The encoder did not produce a file.");
			this.emit("progress", 1);
			this.emit("complete", buffer);
			return buffer;
		} catch (error) {
			if (this.isCancelled) {
				this.emit("cancelled");
				return null;
			}
			throw error;
		} finally {
			this.activeOutput = null;
			if (!finalized) void output.cancel().catch(() => {});
		}
	}
}
