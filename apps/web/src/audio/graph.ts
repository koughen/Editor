import {
	audioReverbImpulse,
	audioCleanupParameters,
	audioAutomationValue,
	audioRouting,
} from "opencut-wasm";
import type { AudioMixSettings, AudioSend } from "./types";
import { resolveMix, getAudioTracks } from "./settings";
import { createProcessor, flushProcessor } from "./worklet";
import type { SceneTracks } from "@/timeline";
type Context = AudioContext | OfflineAudioContext;
export interface ChannelMeter {
	left: number;
	right: number;
	reduction: number;
}
interface Transport {
	timelineStart: number;
	contextStart: number;
	duration: number;
}
interface Endpoint {
	input: AudioNode;
	output: AudioNode;
}
export class AudioChannel {
	readonly input: GainNode;
	readonly output: GainNode;
	readonly preFader: GainNode;
	readonly cleanup: AudioWorkletNode | null;
	private filters: BiquadFilterNode[] = [];
	private readonly eqIn: GainNode;
	private readonly eqOut: GainNode;
	private readonly compIn: GainNode;
	private readonly compOut: GainNode;
	private readonly compressor: DynamicsCompressorNode;
	private readonly verbIn: GainNode;
	private readonly verbOut: GainNode;
	private readonly dryVerb: GainNode;
	private readonly convolver: ConvolverNode;
	private readonly reverb: GainNode;
	private readonly delayIn: GainNode;
	private readonly delayOut: GainNode;
	private readonly dryDelay: GainNode;
	private readonly delay: DelayNode;
	private readonly feedback: GainNode;
	private readonly echo: GainNode;
	private readonly panner: StereoPannerNode;
	private readonly meters: AnalyserNode[];
	private readonly data = new Float32Array(1024);
	private readonly nodes: AudioNode[];
	private decay = -1;
	private topology = "";
	private compActive = false;
	private reduction = 0;
	private settings = resolveMix({});
	private audible = true;
	constructor(
		private readonly options: {
			context: Context;
			destination?: AudioNode;
			settings?: Partial<AudioMixSettings>;
		},
	) {
		const { context, destination } = options;
		const gain = () => context.createGain();
		this.input = gain();
		this.output = gain();
		this.preFader = gain();
		this.eqIn = gain();
		this.eqOut = gain();
		this.compIn = gain();
		this.compOut = gain();
		this.compressor = context.createDynamicsCompressor();
		this.verbIn = gain();
		this.verbOut = gain();
		this.dryVerb = gain();
		this.convolver = context.createConvolver();
		this.reverb = gain();
		this.delayIn = gain();
		this.delayOut = gain();
		this.dryDelay = gain();
		this.delay = context.createDelay(1.1);
		this.feedback = gain();
		this.echo = gain();
		this.panner = context.createStereoPanner();
		this.cleanup = createProcessor({
			context,
			settings: resolveMix({ settings: options.settings }),
		});
		if (this.cleanup)
			this.cleanup.port.onmessage = ({ data }) => {
				this.reduction = data[0] || 0;
			};
		this.verbIn.connect(this.dryVerb).connect(this.verbOut);
		this.verbIn
			.connect(this.convolver)
			.connect(this.reverb)
			.connect(this.verbOut);
		this.delayIn.connect(this.dryDelay).connect(this.delayOut);
		this.delayIn.connect(this.delay).connect(this.echo).connect(this.delayOut);
		this.delay.connect(this.feedback).connect(this.delay);
		this.panner.connect(this.preFader).connect(this.output);
		if (destination) this.output.connect(destination);
		const splitter = context.createChannelSplitter(2);
		this.output.connect(splitter);
		this.meters = [context.createAnalyser(), context.createAnalyser()];
		this.meters.forEach((m, i) => {
			m.fftSize = 1024;
			splitter.connect(m, i);
		});
		this.nodes = [
			this.input,
			this.output,
			this.preFader,
			this.eqIn,
			this.eqOut,
			this.compIn,
			this.compOut,
			this.compressor,
			this.verbIn,
			this.verbOut,
			this.dryVerb,
			this.convolver,
			this.reverb,
			this.delayIn,
			this.delayOut,
			this.dryDelay,
			this.delay,
			this.feedback,
			this.echo,
			this.panner,
			splitter,
			...this.meters,
			...(this.cleanup ? [this.cleanup] : []),
		];
		this.update({ settings: options.settings });
	}
	update({
		settings,
		audible = true,
		transport,
	}: {
		settings?: Partial<AudioMixSettings>;
		audible?: boolean;
		transport?: Transport;
	}) {
		const s = resolveMix({ settings });
		this.settings = s;
		this.audible = audible;
		const context = this.options.context;
		const time = context.currentTime;
		const set = (param: AudioParam, value: number) => {
			param.cancelScheduledValues(time);
			if (time === 0) param.setValueAtTime(value, time);
			else param.setTargetAtTime(value, time, 0.012);
		};
		const eq = s.eqEnabled && !s.bypass;
		const bands: [BiquadFilterType, number, number, number, boolean][] = [
			["highpass", s.highPass > 20 ? s.highPass : 0, 0, -3, eq],
			["lowshelf", 120, s.lowGain, 1, eq],
			["peaking", s.lowMidFreq, s.lowMidGain, 1, eq],
			["peaking", s.highMidFreq, s.highMidGain, 1, eq],
			["highshelf", 8000, s.highGain, 1, eq],
			...s.bands.map(
				(b) =>
					[b.kind, b.frequency, b.gain, b.q, eq && b.enabled] as [
						BiquadFilterType,
						number,
						number,
						number,
						boolean,
					],
			),
		];
		const topology = JSON.stringify([
			s.effectOrder,
			s.bands.map((b) => [b.kind, b.enabled]),
			s.compressorEnabled && !s.bypass,
			eq,
		]);
		if (topology !== this.topology) {
			this.input.disconnect();
			this.eqIn.disconnect();
			this.eqOut.disconnect();
			this.compIn.disconnect();
			this.compOut.disconnect();
			this.compressor.disconnect();
			this.verbOut.disconnect();
			this.delayOut.disconnect();
			this.cleanup?.disconnect();
			this.filters.forEach((f) => {
				f.disconnect();
			});
			this.filters = bands.map(() => context.createBiquadFilter());
			let last: AudioNode = this.eqIn;
			this.filters.forEach((f, i) => {
				if (bands[i][4]) {
					last.connect(f);
					last = f;
				}
			});
			last.connect(this.eqOut);
			this.compActive = s.compressorEnabled && !s.bypass;
			if (this.compActive)
				this.compIn.connect(this.compressor).connect(this.compOut);
			else this.compIn.connect(this.compOut);
			const effects: Record<string, Endpoint> = {
				eq: { input: this.eqIn, output: this.eqOut },
				compressor: { input: this.compIn, output: this.compOut },
				reverb: { input: this.verbIn, output: this.verbOut },
				delay: { input: this.delayIn, output: this.delayOut },
			};
			if (this.cleanup)
				effects.cleanup = { input: this.cleanup, output: this.cleanup };
			last = this.input;
			for (const name of s.effectOrder) {
				const fx = effects[name];
				if (fx) {
					last.connect(fx.input);
					last = fx.output;
				}
			}
			last.connect(this.panner);
			this.topology = topology;
		}
		bands.forEach(([type, freq, g, q, enabled], i) => {
			const f = this.filters[i];
			f.type = type;
			set(f.frequency, Math.min(freq, context.sampleRate * 0.49));
			set(f.gain, enabled ? g : 0);
			set(f.Q, q);
		});
		set(this.compressor.threshold, s.threshold);
		set(this.compressor.ratio, s.ratio);
		set(this.compressor.knee, 6);
		set(this.compressor.attack, s.attack / 1000);
		set(this.compressor.release, s.release / 1000);
		set(this.compOut.gain, this.compActive ? 10 ** (s.makeup / 20) : 1);
		if (
			!s.bypass &&
			(s.reverbMix > 0 || s.automation.reverbMix?.length) &&
			this.decay !== s.reverbDecay
		) {
			this.decay = s.reverbDecay;
			const impulse = context.createBuffer(
				2,
				Math.ceil(context.sampleRate * s.reverbDecay),
				context.sampleRate,
			);
			for (let ch = 0; ch < 2; ch++)
				impulse.copyToChannel(
					new Float32Array(
						audioReverbImpulse(context.sampleRate, s.reverbDecay, ch),
					),
					ch,
				);
			this.convolver.buffer = impulse;
		}
		set(this.reverb.gain, s.bypass ? 0 : s.reverbMix);
		set(this.echo.gain, s.bypass ? 0 : s.delayMix);
		set(this.delay.delayTime, s.delayTime / 1000);
		set(this.feedback.gain, s.bypass ? 0 : s.delayFeedback);
		// Wet-only applies to the first time effect with a nonzero send. It does not duplicate dry audio in a shared return.
		const firstWet =
			s.effectOrder.find(
				(k) =>
					(k === "reverb" && s.reverbMix > 0) ||
					(k === "delay" && s.delayMix > 0),
			) ?? s.effectOrder.find((k) => k === "reverb" || k === "delay");
		set(this.dryVerb.gain, s.wetOnly && firstWet === "reverb" ? 0 : 1);
		set(this.dryDelay.gain, s.wetOnly && firstWet === "delay" ? 0 : 1);
		set(this.panner.pan, s.pan);
		set(this.output.gain, audible ? 10 ** (s.gainDb / 20) : 0);
		this.cleanup?.port.postMessage({
			parameters: audioCleanupParameters(s.cleanup, s.bypass),
		});
		if (transport && s.automationEnabled) this.schedule({ transport });
	}
	private parameter({
		key,
	}: {
		key: string;
	}): { param: AudioParam; scale: (v: number) => number } | null {
		const identity = (v: number) => v;
		const db = (v: number) => 10 ** (v / 20);
		const ms = (v: number) => v / 1000;
		const s = this.settings;
		const eq = s.eqEnabled && !s.bypass;
		const fx = !s.bypass;
		const table: Record<string, [AudioParam, (v: number) => number, boolean]> =
			{
				gainDb: [this.output.gain, db, this.audible],
				pan: [this.panner.pan, identity, true],
				highPass: [this.filters[0].frequency, identity, eq],
				lowGain: [this.filters[1].gain, identity, eq],
				lowMidFreq: [this.filters[2].frequency, identity, eq],
				lowMidGain: [this.filters[2].gain, identity, eq],
				highMidFreq: [this.filters[3].frequency, identity, eq],
				highMidGain: [this.filters[3].gain, identity, eq],
				highGain: [this.filters[4].gain, identity, eq],
				threshold: [this.compressor.threshold, identity, this.compActive],
				ratio: [this.compressor.ratio, identity, this.compActive],
				attack: [this.compressor.attack, ms, this.compActive],
				release: [this.compressor.release, ms, this.compActive],
				makeup: [this.compOut.gain, db, this.compActive],
				reverbMix: [this.reverb.gain, identity, fx],
				delayMix: [this.echo.gain, identity, fx],
				delayTime: [this.delay.delayTime, ms, fx],
				delayFeedback: [this.feedback.gain, identity, fx],
			};
		if (key.startsWith("band:")) {
			const [, i, field] = key.split(":");
			const index = Number(i);
			const f = this.filters[index + 5];
			if (!f || !eq || !s.bands[index]?.enabled) return null;
			const param =
				field === "gain" ? f.gain : field === "q" ? f.Q : f.frequency;
			return { param, scale: identity };
		}
		const item = table[key];
		return item?.[2] ? { param: item[0], scale: item[1] } : null;
	}
	private schedule({ transport }: { transport: Transport }) {
		const now = this.options.context.currentTime;
		const start = Math.max(
			transport.timelineStart,
			transport.timelineStart + now - transport.contextStart,
		);
		for (const [key, points] of Object.entries(this.settings.automation)) {
			if (!points.length) continue;
			const target = this.parameter({ key });
			if (!target) continue;
			const { param, scale } = target;
			param.cancelScheduledValues(now);
			param.setValueAtTime(scale(audioAutomationValue(points, start, 0)), now);
			let previous = start;
			for (const point of points) {
				if (point.time <= start || point.time > transport.duration) continue;
				const prev = points.filter((p) => p.time <= previous).at(-1);
				const time =
					transport.contextStart + point.time - transport.timelineStart;
				if (prev?.hold) param.setValueAtTime(scale(point.value), time);
				else {
					const steps =
						key === "gainDb" || key === "makeup"
							? Math.min(
									4096,
									Math.max(1, Math.ceil((point.time - previous) * 20)),
								)
							: 1;
					for (let i = 1; i <= steps; i++) {
						const t = previous + ((point.time - previous) * i) / steps;
						param.linearRampToValueAtTime(
							scale(audioAutomationValue(points, t, 0)),
							transport.contextStart + t - transport.timelineStart,
						);
					}
				}
				previous = point.time;
			}
		}
	}
	ready() {
		return flushProcessor({ node: this.cleanup });
	}
	readMeter(): ChannelMeter {
		const peaks = this.meters.map((m) => {
			m.getFloatTimeDomainData(this.data);
			let p = 0;
			for (const s of this.data) p = Math.max(p, Math.abs(s));
			return p;
		});
		return {
			left: peaks[0],
			right: peaks[1],
			reduction:
				(this.compActive ? this.compressor.reduction : 0) + this.reduction,
		};
	}
	dispose() {
		this.cleanup?.port.postMessage({ dispose: true });
		this.cleanup?.port.close();
		for (const n of [...this.nodes, ...this.filters]) n.disconnect();
	}
}
export class AudioMixerGraph {
	readonly master: AudioChannel;
	readonly channels = new Map<string, AudioChannel>();
	private readonly elementChannels = new Map<string, string>();
	private readonly routeNodes: GainNode[] = [];
	private routeKey = "";
	private transport?: Transport;
	private stemTrackIds?: string[];
	setStem({ trackIds }: { trackIds?: string[] }) {
		this.stemTrackIds = trackIds;
	}
	constructor(
		private readonly options: { context: Context; destination: AudioNode },
	) {
		this.master = new AudioChannel(options);
	}
	async ready() {
		await Promise.all(
			[this.master, ...this.channels.values()].map((c) => c.ready()),
		);
	}
	setTransport(transport: Transport) {
		this.transport = transport;
	}
	update({ tracks }: { tracks: SceneTracks }) {
		this.master.update({
			settings: tracks.audioMaster,
			transport: this.transport,
		});
		const channelTracks = getAudioTracks({ tracks });
		const channels = [
			...channelTracks.map((t) => ({
				id: t.id,
				kind: "track",
				muted: t.muted,
				solo: t.solo ?? false,
				settings: resolveMix({ settings: t.audioMix }),
			})),
			...(tracks.audioBuses ?? []).map((b) => ({
				id: b.id,
				kind: b.kind,
				muted: b.muted,
				solo: b.solo,
				settings: resolveMix({ settings: b.audioMix }),
			})),
		];
		const routes = audioRouting([
			...channels,
			{
				id: "master",
				kind: "master",
				settings: resolveMix({ settings: tracks.audioMaster }),
			},
		]) as {
			id: string;
			audible: boolean;
			outputAudible: boolean;
			outputId: string;
			sends: AudioSend[];
			duckSource: string;
		}[];
		if (this.stemTrackIds)
			for (const r of routes)
				if (
					channelTracks.some((t) => t.id === r.id) &&
					!this.stemTrackIds.includes(r.id)
				)
					r.audible = false;
		this.elementChannels.clear();
		for (const t of channelTracks)
			for (const e of t.elements) this.elementChannels.set(e.id, t.id);
		for (const c of channels) {
			let channel = this.channels.get(c.id);
			if (!channel) {
				channel = new AudioChannel({
					context: this.options.context,
					settings: c.settings,
				});
				this.channels.set(c.id, channel);
			}
			channel.update({
				settings: c.settings,
				audible: routes.find((r) => r.id === c.id)?.audible,
				transport: this.transport,
			});
		}
		for (const [id, c] of this.channels)
			if (!channels.some((t) => t.id === id)) {
				c.dispose();
				this.channels.delete(id);
			}
		// Reconnect only external routing; effects edit without touching source connections.
		const key = JSON.stringify([
			routes,
			channels.map((c) => [
				c.settings.effectOrder,
				c.settings.bands,
				c.settings.bypass,
				c.settings.eqEnabled,
				c.settings.compressorEnabled,
			]),
		]);
		if (key !== this.routeKey) {
			for (const n of this.routeNodes) n.disconnect();
			this.routeNodes.length = 0;
			// Disconnect explicit external edges; preserve meter and internal fader connections.
			for (const edge of this.edges) {
				try {
					edge.from.disconnect(edge.to, edge.output ?? 0, edge.input ?? 0);
				} catch {}
			}
			this.edges = [];
			for (const r of routes) {
				const c = this.channels.get(r.id);
				if (!c) continue;
				const destination =
					this.channels.get(r.outputId)?.input ?? this.master.input;
				const outputGate = this.options.context.createGain();
				outputGate.gain.value = r.outputAudible ? 1 : 0;
				this.connect(c.output, outputGate);
				outputGate.connect(destination);
				this.routeNodes.push(outputGate);
				for (const send of r.sends) {
					const target = this.channels.get(send.busId);
					if (!target) continue;
					const gain = this.options.context.createGain();
					gain.gain.value = r.audible ? 10 ** (send.levelDb / 20) : 0;
					this.connect(send.preFader ? c.preFader : c.output, gain);
					gain.connect(target.input);
					this.routeNodes.push(gain);
				}
				if (r.duckSource && c.cleanup) {
					const source = this.channels.get(r.duckSource);
					if (source) this.connect(source.input, c.cleanup, 1);
				}
			}
			const masterRoute = routes.find((r) => r.id === "master");
			if (masterRoute?.duckSource && this.master.cleanup) {
				const source = this.channels.get(masterRoute.duckSource);
				if (source) this.connect(source.input, this.master.cleanup, 1);
			}
			this.routeKey = key;
		}
	}
	private edges: {
		from: AudioNode;
		to: AudioNode;
		output?: number;
		input?: number;
	}[] = [];
	private connect(from: AudioNode, to: AudioNode, input = 0) {
		from.connect(to, 0, input);
		this.edges.push({ from, to, output: 0, input });
	}
	inputFor({ elementId }: { elementId: string }): AudioNode {
		return (
			this.channels.get(this.elementChannels.get(elementId) ?? "")?.input ??
			this.master.input
		);
	}
	readMeter({ trackId }: { trackId: string }): ChannelMeter {
		return (
			(trackId === "master"
				? this.master
				: this.channels.get(trackId)
			)?.readMeter() ?? { left: 0, right: 0, reduction: 0 }
		);
	}
	dispose() {
		for (const n of this.routeNodes) n.disconnect();
		this.master.dispose();
		for (const c of this.channels.values()) c.dispose();
		this.channels.clear();
	}
}
