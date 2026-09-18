import { createTimelineAudioBuffer } from "@/media/audio";
import { getAudioTracks } from "@/audio/settings";
import { toast } from "sonner";
import {
	initializeAudioProcessing,
	createProcessor,
	readLoudnessMessage,
	SILENT_LOUDNESS,
} from "@/audio/worklet";
import type { LoudnessReading } from "@/audio/types";
import { AudioMixerGraph, type ChannelMeter } from "@/audio/graph";
import type { EditorCore } from "@/core";
import { TICKS_PER_SECOND } from "@/wasm";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { AudioClipSource } from "@/media/audio";
import { createAudioContext, collectAudioClips } from "@/media/audio";
import {
	buildAudioGainAutomation,
	hasAnimatedVolume,
} from "@/timeline/audio-state";
import { createAudioMasteringChain } from "@/media/audio-mastering";
import {
	getClipTimeAtSourceTime,
	getSourceTimeAtClipTime,
	renderRetimedBuffer,
} from "@/retime";
import {
	ALL_FORMATS,
	AudioBufferSink,
	BlobSource,
	Input,
	type WrappedAudioBuffer,
} from "mediabunny";

export class AudioManager {
	private loudness: LoudnessReading = { ...SILENT_LOUDNESS };
	private loudnessNode: AudioWorkletNode | null = null;
	private meterTap: GainNode | null = null;
	private monitorGain: GainNode | null = null;
	readLoudness(): LoudnessReading {
		return this.loudness;
	}
	resetLoudness(): void {
		if (!this.audioContext || !this.meterTap || !this.monitorGain) return;
		this.loudnessNode?.port.postMessage({ dispose: true });
		this.loudnessNode?.disconnect();
		this.loudnessNode?.port.close();
		this.meterTap.disconnect();
		this.loudness = { ...SILENT_LOUDNESS };
		this.loudnessNode = createProcessor({
			context: this.audioContext,
			meter: true,
		});
		if (this.loudnessNode) {
			this.meterTap.connect(this.loudnessNode).connect(this.monitorGain);
			this.loudnessNode.port.postMessage({
				active: this.editor.playback.getIsPlaying(),
			});
			this.loudnessNode.port.onmessage = ({ data }) => {
				this.loudness = readLoudnessMessage({ data });
			};
		} else this.meterTap.connect(this.monitorGain);
	}
	private audioContext: AudioContext | null = null;
	private mixer: AudioMixerGraph | null = null;
	private timelineSignature = "";
	private pluginPreview: {
		signature: string;
		buffer: AudioBuffer;
		tailSeconds: number;
		tracks: import("@/timeline").SceneTracks;
		assets: import("@/media/types").MediaAsset[];
	} | null = null;
	private nativePlaying = false;
	private useReferencePreview = false;
	setLivePreview(): void {
		this.useReferencePreview = false;
		this.editor.playback.pause();
	}
	getPlaybackTailSeconds(): number {
		return this.useReferencePreview &&
			this.pluginPreview &&
			this.editor.scenes.getActiveSceneOrNull() &&
			this.pluginPreview.tracks ===
				this.editor.scenes.getActiveSceneOrNull()?.tracks &&
			this.pluginPreview.assets === this.editor.media.getAssets()
			? this.pluginPreview.tailSeconds
			: 0;
	}
	getPreviewMode(): string {
		return this.nativePlaying
			? "Rendered preview"
			: this.useReferencePreview && this.pluginPreview
				? "Rendered preview ready"
				: "Live mixer";
	}
	private mixSignature(): string {
		const scene = this.editor.scenes.getActiveScene();
		return JSON.stringify([
			scene.id,
			scene.tracks,
			this.editor.media.getAssets().map((m) => [m.id, m.url]),
		]);
	}
	async preparePluginPreview({
		tailSeconds = 3,
	}: {
		tailSeconds?: number;
	} = {}): Promise<void> {
		this.editor.playback.pause();
		const scene = this.editor.scenes.getActiveScene();
		const signature = this.mixSignature();
		const buffer = await createTimelineAudioBuffer({
			tracks: scene.tracks,
			mediaAssets: this.editor.media.getAssets(),
			duration: this.editor.timeline.getTotalDuration(),
			tailSeconds,
			audioContext: this.ensureAudioContext() ?? undefined,
		});
		if (!buffer) throw new Error("Add audio to the timeline first.");
		if (signature !== this.mixSignature())
			throw new Error(
				"The mix changed during rendering. Render the preview again.",
			);
		this.pluginPreview = {
			signature,
			buffer,
			tailSeconds,
			tracks: scene.tracks,
			assets: this.editor.media.getAssets(),
		};
		this.useReferencePreview = true;
	}

	private masterGain: GainNode | null = null;
	private playbackStartTime = 0;
	private playbackStartContextTime = 0;
	private scheduleTimer: number | null = null;
	private lookaheadSeconds = 2;
	private scheduleIntervalMs = 500;
	private clips: AudioClipSource[] = [];
	private sinks = new Map<string, AudioBufferSink>();
	private inputs = new Map<string, Input>();
	private activeClipIds = new Set<string>();
	private clipIterators = new Map<
		string,
		AsyncGenerator<WrappedAudioBuffer, void, unknown>
	>();
	private queuedSources = new Set<AudioBufferSourceNode>();
	private preparedClipBuffers = new Map<string, Promise<AudioBuffer | null>>();
	private decodedBuffers = new Map<string, Promise<AudioBuffer | null>>();
	private playbackSessionId = 0;
	private lastIsPlaying = false;
	private lastVolume = 1;
	private playbackLatencyCompensationSeconds = 0;
	private unsubscribers: Array<() => void> = [];

	constructor(private editor: EditorCore) {
		this.lastVolume = this.editor.playback.getVolume();

		this.unsubscribers.push(
			this.editor.playback.subscribe(this.handlePlaybackChange),
			this.editor.timeline.subscribe(this.handleTimelineChange),
			this.editor.media.subscribe(this.handleTimelineChange),
			this.editor.playback.onSeek(this.handleSeek),
		);
	}

	dispose(): void {
		this.stopPlayback();
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this.disposeSinks();
		this.preparedClipBuffers.clear();
		this.decodedBuffers.clear();
		if (this.audioContext) {
			void this.audioContext.close();
			this.audioContext = null;
			this.masterGain = null;
		}
	}

	private handlePlaybackChange = (): void => {
		const isPlaying = this.editor.playback.getIsPlaying();
		const volume = this.editor.playback.getVolume();

		if (volume !== this.lastVolume) {
			this.lastVolume = volume;
			this.updateGain();
		}

		if (isPlaying !== this.lastIsPlaying) {
			this.lastIsPlaying = isPlaying;
			if (isPlaying) {
				void this.startPlayback({
					time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
				});
			} else {
				this.stopPlayback();
			}
		}
	};

	private handleSeek = (time: number): void => {
		if (this.editor.playback.getIsScrubbing()) {
			this.stopPlayback();
			return;
		}

		if (this.editor.playback.getIsPlaying()) {
			void this.startPlayback({ time: time / TICKS_PER_SECOND });
			return;
		}

		this.stopPlayback();
	};

	readMeter({ trackId }: { trackId: string }): ChannelMeter {
		return this.editor.playback.getIsPlaying() && this.mixer
			? this.mixer.readMeter({ trackId })
			: { left: 0, right: 0, reduction: 0 };
	}

	private handleTimelineChange = (): void => {
		const scene = this.editor.scenes.getActiveSceneOrNull();
		if (this.nativePlaying) {
			this.editor.playback.pause();
			toast.info(
				"Mix changed. Render the plug-in preview again to hear the updated mix.",
			);
		}
		if (
			scene &&
			this.editor.playback.getIsPlaying() &&
			[
				...getAudioTracks({ tracks: scene.tracks }).map((t) => t.audioMix),
				scene.tracks.audioMaster,
			].some((s) => !s?.bypass && s?.plugins?.some((p) => !p.bypass))
		) {
			this.editor.playback.pause();
			toast.info("Render the plug-in preview to hear the updated mix.");
		}
		if (scene && this.mixer) this.mixer.update({ tracks: scene.tracks });
		// Channel edits update live nodes without interrupting or decoding clips.
		const signature = JSON.stringify([
			scene?.id,
			scene
				? [
						...scene.tracks.overlay,
						scene.tracks.main,
						...scene.tracks.audio,
					].map((t) => [t.id, t.elements])
				: [],
			this.editor.media.getAssets().map((m) => [m.id, m.url]),
		]);
		if (signature === this.timelineSignature) return;
		this.timelineSignature = signature;
		this.disposeSinks();
		this.preparedClipBuffers.clear();
		this.decodedBuffers.clear();

		if (!this.editor.playback.getIsPlaying()) return;

		void this.startPlayback({
			time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
		});
	};

	private ensureAudioContext(): AudioContext | null {
		if (this.audioContext) return this.audioContext;
		if (typeof window === "undefined") return null;

		this.audioContext = createAudioContext();
		this.meterTap = this.audioContext.createGain();
		this.monitorGain = this.audioContext.createGain();
		this.monitorGain.gain.value = this.lastVolume;
		this.meterTap
			.connect(this.monitorGain)
			.connect(this.audioContext.destination);
		const { input } = createAudioMasteringChain({
			audioContext: this.audioContext,
			destination: this.meterTap,
		});
		this.masterGain = input;
		this.masterGain.gain.value = 1;
		return this.audioContext;
	}

	private updateGain(): void {
		if (!this.monitorGain) return;
		this.monitorGain.gain.value = this.lastVolume;
	}

	private getPlaybackTime(): number {
		if (!this.audioContext) return this.playbackStartTime;
		const elapsed =
			this.audioContext.currentTime - this.playbackStartContextTime;
		return this.playbackStartTime + elapsed;
	}

	private async startPlayback({ time }: { time: number }): Promise<void> {
		try {
			await this.startPlaybackInternal({ time });
		} catch (e) {
			this.editor.playback.pause();
			toast.error(
				e instanceof Error ? e.message : "Audio playback could not start.",
			);
		}
	}

	private async startPlaybackInternal({
		time,
	}: {
		time: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		this.stopPlayback();
		const sessionId = this.playbackSessionId;
		this.playbackLatencyCompensationSeconds = 0;

		const tracks = this.editor.scenes.getActiveScene().tracks;
		const mediaAssets = this.editor.media.getAssets();
		const duration = this.editor.timeline.getTotalDuration();

		if (duration <= 0) return;

		if (audioContext.state === "suspended") {
			await audioContext.resume();
		}

		await initializeAudioProcessing({ context: audioContext });
		const clips = await collectAudioClips({ tracks, mediaAssets });
		if (
			!this.editor.playback.getIsPlaying() ||
			sessionId !== this.playbackSessionId
		)
			return;
		time = this.editor.playback.getCurrentTime() / TICKS_PER_SECOND;
		this.resetLoudness();
		const hasPlugins = [
			...getAudioTracks({ tracks }).map((t) => t.audioMix),
			tracks.audioMaster,
		].some((s) => !s?.bypass && s?.plugins?.some((p) => !p.bypass));
		if (
			hasPlugins ||
			(this.useReferencePreview &&
				this.pluginPreview?.signature === this.mixSignature())
		) {
			if (
				!this.pluginPreview ||
				this.pluginPreview.signature !== this.mixSignature()
			) {
				this.editor.playback.pause();
				toast.info(
					"Render the plug-in preview in Audio → Effects → Audio Unit inserts, then press Play.",
				);
				return;
			}
			const source = audioContext.createBufferSource();
			source.buffer = this.pluginPreview.buffer;
			source.connect(this.meterTap ?? audioContext.destination);
			source.start(0, Math.min(time, source.buffer.duration));
			this.queuedSources.add(source);
			this.nativePlaying = true;
			return;
		}
		this.clips = clips;
		this.mixer = new AudioMixerGraph({
			context: audioContext,
			destination: this.masterGain ?? audioContext.destination,
		});
		this.mixer.setTransport({
			timelineStart: time,
			contextStart: audioContext.currentTime,
			duration: duration / TICKS_PER_SECOND,
		});
		this.mixer.update({ tracks: this.editor.scenes.getActiveScene().tracks });
		this.timelineSignature = JSON.stringify([
			this.editor.scenes.getActiveScene().id,
			[...tracks.overlay, tracks.main, ...tracks.audio].map((t) => [
				t.id,
				t.elements,
			]),
			mediaAssets.map((m) => [m.id, m.url]),
		]);

		this.playbackStartTime = time;
		this.playbackStartContextTime = audioContext.currentTime;

		this.scheduleUpcomingClips();

		if (typeof window !== "undefined") {
			this.scheduleTimer = window.setInterval(() => {
				this.scheduleUpcomingClips();
			}, this.scheduleIntervalMs);
		}
	}

	private scheduleUpcomingClips(): void {
		if (!this.editor.playback.getIsPlaying()) return;

		const currentTime = this.getPlaybackTime();
		const windowEnd = currentTime + this.lookaheadSeconds;

		for (const clip of this.clips) {
			if (clip.muted) continue;
			if (this.activeClipIds.has(clip.id)) continue;

			const clipEnd = clip.startTime + clip.duration;
			if (clipEnd <= currentTime) continue;
			if (clip.startTime > windowEnd) continue;

			this.activeClipIds.add(clip.id);
			if (this.shouldUsePreparedClipBuffer({ clip })) {
				void this.schedulePreparedClip({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				});
			} else {
				void this.runClipIterator({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				});
			}
		}
	}

	private stopPlayback(): void {
		this.nativePlaying = false;
		this.loudnessNode?.port.postMessage({ active: false });
		this.playbackSessionId++;
		this.mixer?.dispose();
		this.mixer = null;
		if (this.scheduleTimer && typeof window !== "undefined") {
			window.clearInterval(this.scheduleTimer);
		}
		this.scheduleTimer = null;

		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const source of this.queuedSources) {
			try {
				source.stop();
			} catch {}
			source.disconnect();
		}
		this.queuedSources.clear();
	}

	private async runClipIterator({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const sink = await this.getAudioSink({ clip });
		if (!sink || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterSinkReady = this.getPlaybackTime();
		const iteratorStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterSinkReady,
		);
		if (iteratorStartTime >= clipEnd) {
			return;
		}
		const sourceStartTime =
			clip.trimStart +
			getSourceTimeAtClipTime({
				clipTime: iteratorStartTime - clip.startTime,
				retime: clip.retime,
			});

		const iterator = sink.buffers(sourceStartTime);
		this.clipIterators.set(clip.id, iterator);
		let consecutiveDroppedBufferCount = 0;

		for await (const { buffer, timestamp } of iterator) {
			if (!this.editor.playback.getIsPlaying()) return;
			if (sessionId !== this.playbackSessionId) return;

			const timelineTime =
				clip.startTime +
				getClipTimeAtSourceTime({
					sourceTime: timestamp - clip.trimStart,
					retime: clip.retime,
				});
			if (timelineTime >= clipEnd) break;

			const node = audioContext.createBufferSource();
			node.buffer = buffer;
			if (clip.retime) {
				node.playbackRate.value = clampRetimeRate({ rate: clip.retime.rate });
			}
			const clipGain = audioContext.createGain();
			clipGain.gain.value = clip.volume;
			node.connect(clipGain);
			clipGain.connect(
				this.mixer?.inputFor({ elementId: clip.id }) ??
					this.masterGain ??
					audioContext.destination,
			);

			const startTimestamp =
				this.playbackStartContextTime +
				this.playbackLatencyCompensationSeconds +
				(timelineTime - this.playbackStartTime);

			if (startTimestamp >= audioContext.currentTime) {
				node.start(startTimestamp);
				consecutiveDroppedBufferCount = 0;
			} else {
				const offset = audioContext.currentTime - startTimestamp;
				if (offset < buffer.duration) {
					node.start(audioContext.currentTime, offset);
					consecutiveDroppedBufferCount = 0;
				} else {
					consecutiveDroppedBufferCount += 1;
					if (consecutiveDroppedBufferCount >= 5) {
						const nextCompensationSeconds = Math.max(
							this.playbackLatencyCompensationSeconds,
							Math.min(0.25, offset + 0.01),
						);
						if (
							nextCompensationSeconds >
							this.playbackLatencyCompensationSeconds + 0.001
						) {
							this.playbackLatencyCompensationSeconds = nextCompensationSeconds;
						}
						const resyncStartTime = this.getPlaybackTime();
						this.clipIterators.delete(clip.id);
						void this.runClipIterator({
							clip,
							startTime: resyncStartTime,
							sessionId,
						});
						return;
					}
					continue;
				}
			}

			node.stop(
				Math.max(
					audioContext.currentTime,
					this.playbackStartContextTime +
						this.playbackLatencyCompensationSeconds +
						clipEnd -
						this.playbackStartTime,
				),
			);
			this.queuedSources.add(node);
			node.addEventListener("ended", () => {
				node.disconnect();
				clipGain.disconnect();
				this.queuedSources.delete(node);
			});

			const aheadTime = timelineTime - this.getPlaybackTime();
			if (aheadTime >= 1) {
				await this.waitUntilCaughtUp({ timelineTime, targetAhead: 1 });
				if (sessionId !== this.playbackSessionId) return;
			}
		}

		this.clipIterators.delete(clip.id);
		// don't remove from activeClipIds - prevents scheduler from restarting this clip
		// the set is cleared on stopPlayback anyway
	}

	private async schedulePreparedClip({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const buffer = await this.getPreparedClipBuffer({ clip });
		if (!buffer || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterReady = this.getPlaybackTime();
		const effectiveStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterReady,
		);
		if (effectiveStartTime >= clipEnd) {
			return;
		}

		const node = audioContext.createBufferSource();
		node.buffer = buffer;
		const clipGain = audioContext.createGain();
		node.connect(clipGain);
		clipGain.connect(
			this.mixer?.inputFor({ elementId: clip.id }) ??
				this.masterGain ??
				audioContext.destination,
		);

		const startTimestamp =
			this.playbackStartContextTime +
			this.playbackLatencyCompensationSeconds +
			(effectiveStartTime - this.playbackStartTime);
		const clipOffset = effectiveStartTime - clipStart;
		let actualStartTimestamp = startTimestamp;
		let actualClipOffset = clipOffset;

		if (startTimestamp >= audioContext.currentTime) {
			node.start(startTimestamp, clipOffset);
		} else {
			const lateOffset = audioContext.currentTime - startTimestamp;
			actualStartTimestamp = audioContext.currentTime;
			actualClipOffset = clipOffset + lateOffset;
			node.start(actualStartTimestamp, actualClipOffset);
		}

		this.scheduleClipGainAutomation({
			audioContext,
			clip,
			clipGain,
			startTimestamp: actualStartTimestamp,
			startLocalTime: actualClipOffset,
		});

		this.queuedSources.add(node);
		node.addEventListener("ended", () => {
			node.disconnect();
			clipGain.disconnect();
			this.queuedSources.delete(node);
		});
	}

	private waitUntilCaughtUp({
		timelineTime,
		targetAhead,
	}: {
		timelineTime: number;
		targetAhead: number;
	}): Promise<void> {
		return new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (!this.editor.playback.getIsPlaying()) {
					clearInterval(checkInterval);
					resolve();
					return;
				}

				const playbackTime = this.getPlaybackTime();
				if (timelineTime - playbackTime < targetAhead) {
					clearInterval(checkInterval);
					resolve();
				}
			}, 100);
		});
	}

	private disposeSinks(): void {
		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const input of this.inputs.values()) {
			input.dispose();
		}
		this.inputs.clear();
		this.sinks.clear();
	}

	private shouldUsePreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): boolean {
		return (
			this.hasCurveRetime({ clip }) ||
			hasAnimatedVolume({ element: clip.timelineElement }) ||
			shouldMaintainPitch({
				rate: clip.retime?.rate ?? 1,
				maintainPitch: clip.retime?.maintainPitch,
			})
		);
	}

	private hasCurveRetime({ clip }: { clip: AudioClipSource }): boolean {
		const mode = (clip.retime as { mode?: unknown } | undefined)?.mode;
		return mode === "curve";
	}

	private scheduleClipGainAutomation({
		audioContext,
		clip,
		clipGain,
		startTimestamp,
		startLocalTime,
	}: {
		audioContext: AudioContext;
		clip: AudioClipSource;
		clipGain: GainNode;
		startTimestamp: number;
		startLocalTime: number;
	}): void {
		clipGain.gain.cancelScheduledValues(startTimestamp);
		clipGain.gain.setValueAtTime(clip.volume, startTimestamp);

		if (!hasAnimatedVolume({ element: clip.timelineElement })) {
			return;
		}

		const points = buildAudioGainAutomation({
			element: clip.timelineElement,
			fromLocalTime: startLocalTime,
			toLocalTime: clip.duration,
		});

		if (points.length === 0) {
			return;
		}

		clipGain.gain.setValueAtTime(points[0].gain, startTimestamp);
		for (let index = 1; index < points.length; index++) {
			const point = points[index];
			const pointTimestamp =
				startTimestamp + (point.localTime - startLocalTime);
			if (pointTimestamp < audioContext.currentTime) {
				continue;
			}

			clipGain.gain.linearRampToValueAtTime(point.gain, pointTimestamp);
		}
	}

	private buildPreparedClipCacheKey({
		clip,
	}: {
		clip: AudioClipSource;
	}): string {
		return JSON.stringify({
			id: clip.id,
			sourceKey: clip.sourceKey,
			startTime: clip.startTime,
			duration: clip.duration,
			trimStart: clip.trimStart,
			trimEnd: clip.trimEnd,
			retime: clip.retime ?? null,
		});
	}

	private async getPreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const cacheKey = this.buildPreparedClipCacheKey({ clip });
		const existing = this.preparedClipBuffers.get(cacheKey);
		if (existing) {
			return existing;
		}

		const promise = (async () => {
			const audioContext = this.ensureAudioContext();
			if (!audioContext) {
				return null;
			}

			const decodedBuffer = await this.getDecodedBuffer({ clip });
			if (!decodedBuffer) {
				return null;
			}

			return await renderRetimedBuffer({
				audioContext,
				sourceBuffer: decodedBuffer,
				trimStart: clip.trimStart,
				clipDuration: clip.duration,
				retime: clip.retime,
				maintainPitch: clip.retime?.maintainPitch === true,
			});
		})();

		this.preparedClipBuffers.set(cacheKey, promise);
		return promise;
	}

	private async getDecodedBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const existing = this.decodedBuffers.get(clip.sourceKey);
		if (existing) {
			return existing;
		}

		const promise = this.decodeClipBuffer({ clip });
		this.decodedBuffers.set(clip.sourceKey, promise);
		return promise;
	}

	private async decodeClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) {
			return null;
		}

		const input = new Input({
			source: new BlobSource(clip.file),
			formats: ALL_FORMATS,
		});

		try {
			const audioTrack = await input.getPrimaryAudioTrack();
			if (!audioTrack) {
				return null;
			}

			if (!(await audioTrack.canDecode())) {
				console.warn(
					`Audio codec "${audioTrack.codec ?? "unknown"}" cannot be decoded by this browser; skipping clip.`,
				);
				return null;
			}

			const sink = new AudioBufferSink(audioTrack);
			const chunks: AudioBuffer[] = [];
			let totalSamples = 0;

			for await (const { buffer } of sink.buffers(0)) {
				chunks.push(buffer);
				totalSamples += buffer.length;
			}

			if (chunks.length === 0) {
				return null;
			}

			const targetSampleRate = audioContext.sampleRate;
			const nativeSampleRate = chunks[0].sampleRate;
			const numChannels = Math.min(2, chunks[0].numberOfChannels);
			const nativeChannels = Array.from(
				{ length: numChannels },
				() => new Float32Array(totalSamples),
			);

			let offset = 0;
			for (const chunk of chunks) {
				for (let channel = 0; channel < numChannels; channel++) {
					nativeChannels[channel].set(
						chunk.getChannelData(Math.min(channel, chunk.numberOfChannels - 1)),
						offset,
					);
				}
				offset += chunk.length;
			}

			const outputSamples = Math.ceil(
				totalSamples * (targetSampleRate / nativeSampleRate),
			);
			const offlineContext = new OfflineAudioContext(
				numChannels,
				outputSamples,
				targetSampleRate,
			);
			const nativeBuffer = audioContext.createBuffer(
				numChannels,
				totalSamples,
				nativeSampleRate,
			);

			for (let channel = 0; channel < numChannels; channel++) {
				nativeBuffer.copyToChannel(nativeChannels[channel], channel);
			}

			const sourceNode = offlineContext.createBufferSource();
			sourceNode.buffer = nativeBuffer;
			sourceNode.connect(offlineContext.destination);
			sourceNode.start(0);

			return await offlineContext.startRendering();
		} catch (error) {
			console.warn("Failed to decode clip audio:", error);
			return null;
		} finally {
			input.dispose();
		}
	}

	private async getAudioSink({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBufferSink | null> {
		const existingSink = this.sinks.get(clip.sourceKey);
		if (existingSink) return existingSink;

		try {
			const input = new Input({
				source: new BlobSource(clip.file),
				formats: ALL_FORMATS,
			});
			const audioTrack = await input.getPrimaryAudioTrack();
			if (!audioTrack) {
				input.dispose();
				return null;
			}

			if (!(await audioTrack.canDecode())) {
				console.warn(
					`Audio codec "${audioTrack.codec ?? "unknown"}" cannot be decoded by this browser; clip will be silent.`,
				);
				input.dispose();
				return null;
			}

			const sink = new AudioBufferSink(audioTrack);
			this.inputs.set(clip.sourceKey, input);
			this.sinks.set(clip.sourceKey, sink);
			return sink;
		} catch (error) {
			console.warn("Failed to initialize audio sink:", error);
			return null;
		}
	}
}
