// Bundle as a browser module and initialize the web-target WASM before loading.
// This tests actual Web Audio output; it never connects to the speakers.
import { initializeAudioProcessing } from "../src/audio/worklet";
import { resolveMix } from "../src/audio/settings";
import { analyzeAudio } from "../src/audio/export";
import { AudioChannel, AudioMixerGraph } from "../src/audio/graph";
import { createTimelineAudioBuffer } from "../src/media/audio";
import type { AudioMixSettings } from "../src/audio/types";
import type { SceneTracks } from "../src/timeline";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "../src/wasm";

function assert(ok: unknown, message: string): asserts ok {
	if (!ok) throw new Error(message);
}
function rms(data: Float32Array, start = 4000, end = data.length) {
	let sum = 0;
	for (let i = start; i < end; i++) sum += data[i] ** 2;
	return Math.sqrt(sum / Math.max(1, end - start));
}
function signal(context: BaseAudioContext, frequency = 1000, length = 24000) {
	const buffer = context.createBuffer(2, length, 48000);
	for (let c = 0; c < 2; c++)
		for (let i = 0; i < length; i++)
			buffer.getChannelData(c)[i] =
				0.3 * Math.sin((i / 48000) * Math.PI * 2 * frequency);
	return buffer;
}
async function render(
	settings: Partial<AudioMixSettings> = {},
	audible = true,
	frequency = 1000,
	sourceLength = 24000,
) {
	const context = new OfflineAudioContext(2, 48000, 48000);
	await initializeAudioProcessing({ context });
	const channel = new AudioChannel({
		context,
		destination: context.destination,
	});
	channel.update({ settings, audible });
	const source = context.createBufferSource();
	source.buffer = signal(context, frequency, sourceLength);
	source.connect(channel.input);
	source.start();
	await channel.ready();
	const output = await context.startRendering();
	channel.dispose();
	return output;
}

const results: string[] = [];
async function check(name: string, test: () => Promise<void>) {
	try {
		await test();
		results.push(`PASS ${name}`);
	} catch (error) {
		results.push(`FAIL ${name}: ${String(error)}`);
	}
	const output = document.querySelector("pre");
	if (output) output.textContent = results.join("\n");
}
const baseline = await render();
const level = rms(baseline.getChannelData(0), 4000, 20000);
await check("neutral channel preserves signal", async () =>
	assert(Math.abs(level - 0.3 / Math.sqrt(2)) < 0.003, `RMS ${level}`),
);
await check("fader applies -6 dB", async () => {
	const output = await render({ gainDb: -6 });
	const ratio = rms(output.getChannelData(0), 4000, 20000) / level;
	assert(Math.abs(ratio - 0.5012) < 0.005, `ratio ${ratio}`);
});
await check("hard left pan silences right channel", async () => {
	const output = await render({ pan: -1 });
	assert(rms(output.getChannelData(1)) < 0.00001, "Right channel audible");
});
await check("muted bus produces silence", async () => {
	const output = await render({}, false);
	assert(rms(output.getChannelData(0)) === 0, "Muted channel audible");
});
await check("EQ low cut attenuates 60 Hz", async () => {
	const flat = await render({}, true, 60);
	const cut = await render({ highPass: 400 }, true, 60);
	assert(
		rms(cut.getChannelData(0)) < rms(flat.getChannelData(0)) / 10,
		"Low cut did not attenuate",
	);
});
await check("bypass removes EQ coloration", async () => {
	const bypass = await render({
		lowGain: 18,
		highGain: -18,
		highPass: 1000,
		bypass: true,
	});
	assert(
		Math.abs(rms(bypass.getChannelData(0), 4000, 20000) - level) < 0.003,
		"Bypass changed signal",
	);
});
await check("compressor reduces dynamic peaks", async () => {
	const output = await render({
		compressorEnabled: true,
		threshold: -40,
		ratio: 20,
		attack: 0.1,
		release: 50,
	});
	assert(
		rms(output.getChannelData(0), 8000, 20000) < level * 0.8,
		"Compression did not reduce level",
	);
});
await check("reverb generates a repeatable tail", async () => {
	const a = await render({ reverbMix: 0.5 }, true, 1000, 2400);
	const b = await render({ reverbMix: 0.5 }, true, 1000, 2400);
	assert(rms(a.getChannelData(0), 5000, 20000) > 0.00001, "No reverb tail");
	assert(
		Math.abs(rms(a.getChannelData(0)) - rms(b.getChannelData(0))) < 0.000001,
		"Reverb differs between renders",
	);
});
await check("delay produces an echo after the source ends", async () => {
	const output = await render(
		{ delayMix: 0.5, delayTime: 150, delayFeedback: 0.3 },
		true,
		1000,
		2400,
	);
	assert(rms(output.getChannelData(0), 7500, 8500) > 0.01, "No delayed signal");
});
await check("solo routes only selected tracks", async () => {
	const context = new OfflineAudioContext(2, 24000, 48000);
	const tracks: SceneTracks = {
		overlay: [],
		main: {
			id: "video",
			name: "Video",
			type: "video",
			elements: [],
			muted: false,
			hidden: false,
		},
		audio: [
			{
				id: "solo",
				name: "Solo",
				type: "audio",
				elements: [],
				muted: false,
				solo: true,
			},
		],
	};
	const mixer = new AudioMixerGraph({
		context,
		destination: context.destination,
	});
	mixer.update({ tracks });
	const source = context.createBufferSource();
	source.buffer = signal(context);
	const video = mixer.channels.get("video");
	assert(video, "Video bus is missing");
	source.connect(video.input);
	source.start();
	const output = await context.startRendering();
	mixer.dispose();
	assert(rms(output.getChannelData(0)) === 0, "Unsoloed track audible");
});
await check(
	"timeline export applies channel pan, gain, and clip fades",
	async () => {
		const context = new AudioContext({ sampleRate: 48000 });
		try {
			const tracks: SceneTracks = {
				overlay: [],
				main: {
					id: "video",
					name: "Video",
					type: "video",
					elements: [],
					muted: false,
					hidden: false,
				},
				audio: [
					{
						id: "voice",
						type: "audio",
						name: "Voice",
						muted: false,
						audioMix: { pan: -1, gainDb: -6 },
						elements: [
							{
								id: "voice-clip",
								type: "audio",
								name: "Voice",
								sourceType: "library",
								sourceUrl: "",
								volume: 0,
								buffer: signal(context),
								fadeIn: 0.1,
								fadeOut: 0.1,
								startTime: ZERO_MEDIA_TIME,
								trimStart: ZERO_MEDIA_TIME,
								trimEnd: ZERO_MEDIA_TIME,
								duration: mediaTimeFromSeconds({ seconds: 0.5 }),
							},
						],
					},
				],
			};
			const output = await createTimelineAudioBuffer({
				tracks,
				mediaAssets: [],
				duration: mediaTimeFromSeconds({ seconds: 0.5 }),
				sampleRate: 48000,
				audioContext: context,
			});
			assert(output, "No exported audio");
			assert(rms(output.getChannelData(1)) < 0.00001, "Export ignored pan");
			const left = output.getChannelData(0);
			assert(
				rms(left, 100, 1000) < rms(left, 8000, 12000) * 0.5,
				"Export ignored fade in",
			);
			assert(
				rms(left, 23000, 23900) < rms(left, 8000, 12000) * 0.5,
				"Export ignored fade out",
			);
		} finally {
			await context.close();
		}
	},
);

await check("worklet gate suppresses quiet audio", async () => {
	const out = await render({
		cleanup: {
			...resolveMix({}).cleanup,
			gateEnabled: true,
			gateThreshold: -4,
			gateRatio: 20,
			gateRelease: 10,
		},
	});
	assert(
		rms(out.getChannelData(0), 15000, 20000) < 0.001,
		"Gate did not suppress signal",
	);
});
await check("worklet de-esser reduces high frequency energy", async () => {
	const out = await render(
		{
			cleanup: {
				...resolveMix({}).cleanup,
				deessEnabled: true,
				deessThreshold: -40,
				deessAmount: 12,
			},
		},
		true,
		10000,
	);
	const flat = await render({}, true, 10000);
	assert(
		rms(out.getChannelData(0), 5000, 20000) <
			rms(flat.getChannelData(0), 5000, 20000) * 0.8,
		"No de-essing",
	);
});
await check("track automation ramps gain and resolves seek state", async () => {
	const context = new OfflineAudioContext(2, 48000, 48000);
	await initializeAudioProcessing({ context });
	const channel = new AudioChannel({
		context,
		destination: context.destination,
	});
	channel.update({
		settings: {
			automation: {
				gainDb: [
					{ time: 0, value: -24 },
					{ time: 1, value: 0 },
				],
			},
		},
		transport: { timelineStart: 0.5, contextStart: 0, duration: 1.5 },
	});
	const source = context.createBufferSource();
	source.buffer = signal(context, 1000, 48000);
	source.connect(channel.input);
	source.start();
	await channel.ready();
	const out = await context.startRendering();
	channel.dispose();
	const l = out.getChannelData(0);
	assert(
		rms(l, 1000, 3000) < rms(l, 20000, 22000) * 0.45,
		"Automation ignored timeline offset",
	);
});
await check("group fader and shared wet return preserve routing", async () => {
	const context = new OfflineAudioContext(2, 48000, 48000);
	await initializeAudioProcessing({ context });
	const tracks: SceneTracks = {
		main: {
			id: "v",
			name: "v",
			type: "video",
			elements: [],
			muted: false,
			hidden: false,
		},
		overlay: [],
		audio: [
			{
				id: "a",
				name: "a",
				type: "audio",
				elements: [],
				muted: false,
				audioMix: {
					outputId: "group",
					sends: [{ busId: "echo", levelDb: 0, preFader: false }],
				},
			},
		],
		audioBuses: [
			{
				id: "group",
				name: "Group",
				kind: "group",
				muted: false,
				solo: false,
				audioMix: { gainDb: -6 },
			},
			{
				id: "echo",
				name: "Echo",
				kind: "return",
				muted: false,
				solo: false,
				audioMix: {
					wetOnly: true,
					delayMix: 1,
					delayTime: 200,
					delayFeedback: 0,
				},
			},
		],
	};
	const mixer = new AudioMixerGraph({
		context,
		destination: context.destination,
	});
	mixer.update({ tracks });
	const source = context.createBufferSource();
	source.buffer = signal(context, 1000, 4800);
	const channel = mixer.channels.get("a");
	assert(channel, "Missing track");
	source.connect(channel.input);
	source.start();
	await mixer.ready();
	const out = await context.startRendering();
	mixer.dispose();
	const l = out.getChannelData(0);
	assert(
		Math.abs(rms(l, 1000, 4000) / level - 0.5012) < 0.015,
		"Group fader or dry return wrong",
	);
	assert(rms(l, 10500, 13500) > level * 0.95, "Shared echo missing");
});
await check(
	"sidechain still triggers when rendering a music stem",
	async () => {
		const context = new OfflineAudioContext(2, 48000, 48000);
		await initializeAudioProcessing({ context });
		const tracks: SceneTracks = {
			main: {
				id: "voice",
				name: "Voice",
				type: "video",
				elements: [],
				muted: false,
				hidden: false,
			},
			overlay: [],
			audio: [
				{
					id: "music",
					name: "Music",
					type: "audio",
					elements: [],
					muted: false,
					audioMix: {
						duckSource: "voice",
						cleanup: {
							...resolveMix({}).cleanup,
							duckEnabled: true,
							duckAmount: 18,
						},
					},
				},
			],
		};
		const mixer = new AudioMixerGraph({
			context,
			destination: context.destination,
		});
		mixer.setStem({ trackIds: ["music"] });
		mixer.update({ tracks });
		for (const id of ["voice", "music"]) {
			const source = context.createBufferSource();
			source.buffer = signal(context, 1000, 48000);
			const channel = mixer.channels.get(id);
			assert(channel, "Missing track");
			source.connect(channel.input);
			source.start();
		}
		await mixer.ready();
		const out = await context.startRendering();
		mixer.dispose();
		assert(
			rms(out.getChannelData(0), 24000, 45000) < level * 0.2,
			"Stem lost its sidechain detector",
		);
	},
);
await check("effects order changes compressed EQ output", async () => {
	const settings = {
		highGain: 18,
		compressorEnabled: true,
		threshold: -25,
		ratio: 10,
		attack: 1,
	};
	const a = await render(
		{
			...settings,
			effectOrder: ["eq", "compressor", "cleanup", "reverb", "delay"],
		},
		true,
		12000,
	);
	const b = await render(
		{
			...settings,
			effectOrder: ["compressor", "eq", "cleanup", "reverb", "delay"],
		},
		true,
		12000,
	);
	assert(
		rms(b.getChannelData(0), 10000, 20000) >
			rms(a.getChannelData(0), 10000, 20000) * 2,
		"Order did not alter processing",
	);
});
await check("LUFS and true peak analyze the rendered signal", async () => {
	const context = new OfflineAudioContext(2, 192000, 48000);
	const buffer = signal(context, 1000, 192000);
	const reading = await analyzeAudio({ buffer });
	assert(
		Math.abs((reading.integrated ?? 0) + 10.4576) < 0.25,
		`LUFS ${reading.integrated}`,
	);
	assert(
		Math.abs((reading.truePeak ?? 0) + 10.4576) < 0.1,
		`True peak ${reading.truePeak}`,
	);
});
await check("60-second 12-track render remains finite and stable", async () => {
	const context = new OfflineAudioContext(2, 48000 * 60, 48000);
	await initializeAudioProcessing({ context });
	const channels: AudioChannel[] = [];
	for (let i = 0; i < 12; i++) {
		const channel = new AudioChannel({
			context,
			destination: context.destination,
			settings: {
				gainDb: -35,
				cleanup: {
					...resolveMix({}).cleanup,
					gateEnabled: true,
					noiseEnabled: true,
					deessEnabled: true,
				},
			},
		});
		channels.push(channel);
		const source = context.createOscillator();
		source.frequency.value = 100 + i * 110;
		source.connect(channel.input);
		source.start();
		source.stop(59);
	}
	await Promise.all(channels.map((c) => c.ready()));
	const output = await context.startRendering();
	channels.forEach((c) => {
		c.dispose();
	});
	const data = output.getChannelData(0);
	assert(data.every(Number.isFinite), "Nonfinite sample in sustained mix");
	assert(rms(data, 48000 * 30, 48000 * 31) > 0.01, "Mix dropped out");
});
document.title = results.some((r) => r.startsWith("FAIL"))
	? "Audio checks FAILED"
	: `Audio checks: ${results.length} passed`;
const heading = document.querySelector("h1");
if (heading) heading.textContent = document.title;
