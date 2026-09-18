export type FadeCurve = "linear" | "equalPower" | "sCurve";
export interface AutomationPoint {
	id?: string;
	time: number;
	value: number;
	hold?: boolean;
}
export interface EqBand {
	id?: string;
	kind: BiquadFilterType;
	frequency: number;
	gain: number;
	q: number;
	enabled: boolean;
}
export interface AudioSend {
	busId: string;
	levelDb: number;
	preFader: boolean;
}
export interface PluginInsert {
	instanceId?: string;
	id: string;
	name: string;
	parameters: Record<string, number>;
	bypass: boolean;
}
export interface AudioBus {
	id: string;
	name: string;
	kind: "group" | "return";
	audioMix?: Partial<AudioMixSettings>;
	muted: boolean;
	solo: boolean;
}
export interface CleanupSettings {
	noiseEnabled: boolean;
	noiseFloor: number;
	noiseReduction: number;
	gateEnabled: boolean;
	gateThreshold: number;
	gateRatio: number;
	gateAttack: number;
	gateRelease: number;
	deessEnabled: boolean;
	deessFrequency: number;
	deessThreshold: number;
	deessAmount: number;
	duckEnabled: boolean;
	duckThreshold: number;
	duckAmount: number;
	duckAttack: number;
	duckRelease: number;
}
export interface LoudnessReading {
	integrated: number | null;
	momentary: number | null;
	shortTerm: number | null;
	range: number | null;
	truePeak: number | null;
	seconds: number;
}
export interface AudioMixSettings {
	cleanup: CleanupSettings;
	bands: EqBand[];
	effectOrder: string[];
	automation: Record<string, AutomationPoint[]>;
	automationEnabled: boolean;
	outputId: string;
	sends: AudioSend[];
	duckSource: string;
	wetOnly: boolean;
	plugins: PluginInsert[];
	gainDb: number;
	pan: number;
	bypass: boolean;
	eqEnabled: boolean;
	highPass: number;
	lowGain: number;
	lowMidGain: number;
	lowMidFreq: number;
	highMidGain: number;
	highMidFreq: number;
	highGain: number;
	compressorEnabled: boolean;
	threshold: number;
	ratio: number;
	attack: number;
	release: number;
	makeup: number;
	reverbMix: number;
	reverbDecay: number;
	delayMix: number;
	delayTime: number;
	delayFeedback: number;
}
