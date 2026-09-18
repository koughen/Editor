import type { NumberParamDefinition } from "@/params";

export const control = ({
	key,
	label,
	value = 0,
	min = -1,
	max = 1,
	step = 0.01,
}: {
	key: string;
	label: string;
	value?: number;
	min?: number;
	max?: number;
	step?: number;
}): NumberParamDefinition => ({
	key,
	label,
	type: "number",
	default: value,
	min,
	max,
	step,
});
export const ADVANCED_CONTROLS = [
	control({ key: "hue", label: "Hue", min: -0.5, max: 0.5 }),
	control({ key: "colorBoost", label: "Color boost" }),
	control({ key: "midtoneDetail", label: "Midtone detail" }),
	control({ key: "luminanceMix", label: "Luminance mix", min: 0 }),
];
export const QUALIFIER_CONTROLS = [
	control({ key: "qualifierHue", label: "Hue center", min: 0 }),
	control({ key: "qualifierWidth", label: "Hue width", value: 1, min: 0 }),
	control({
		key: "qualifierSoftness",
		label: "Softness",
		value: 0.05,
		min: 0.001,
		max: 0.5,
		step: 0.001,
	}),
	control({ key: "satLow", label: "Saturation low", min: 0 }),
	control({ key: "satHigh", label: "Saturation high", value: 1, min: 0 }),
	control({ key: "lumLow", label: "Luminance low", min: 0 }),
	control({ key: "lumHigh", label: "Luminance high", value: 1, min: 0 }),
];
export const WINDOW_CONTROLS = [
	control({ key: "windowX", label: "Pan", value: 0.5, min: 0 }),
	control({ key: "windowY", label: "Tilt", value: 0.5, min: 0 }),
	control({
		key: "windowWidth",
		label: "Width",
		value: 0.5,
		min: 0.01,
		max: 2,
	}),
	control({
		key: "windowHeight",
		label: "Height",
		value: 0.5,
		min: 0.01,
		max: 2,
	}),
	control({
		key: "windowRotation",
		label: "Rotation",
		min: -180,
		max: 180,
		step: 1,
	}),
	control({ key: "windowSoftness", label: "Softness", value: 0.1, min: 0.001 }),
];
export const DETAIL_CONTROLS = [
	control({
		key: "blurRadius",
		label: "Blur radius",
		min: 0,
		max: 10,
		step: 0.1,
	}),
	control({ key: "sharpen", label: "Sharpen", min: 0, max: 2 }),
	control({ key: "detailMix", label: "Mix", value: 1, min: 0 }),
];
export const MIXER_CONTROLS = [0, 1, 2].flatMap((row) =>
	[0, 1, 2].map((column) =>
		control({
			key: `mix${row}${column}`,
			label: `${["Red", "Green", "Blue"][column]} input`,
			value: row === column ? 1 : 0,
			min: -2,
			max: 2,
		}),
	),
);
export const BAR_CONTROLS = ["lift", "gamma", "gain", "offset"].flatMap(
	(wheel) =>
		["R", "G", "B"].map((channel) =>
			control({ key: `${wheel}${channel}`, label: channel }),
		),
);
export const SWITCH_CONTROLS = [
	"qualifierEnabled",
	"qualifierInvert",
	"windowInvert",
	"monochrome",
	"preserveLuminance",
	"normalizeMixer",
	"logMode",
].map((key) => control({ key, label: key, min: 0, max: 1, step: 1 }));
export const EXTRA_CONTROLS = [
	control({ key: "lutMix", label: "LUT mix", value: 1, min: 0 }),
	...ADVANCED_CONTROLS,
	...QUALIFIER_CONTROLS,
	...WINDOW_CONTROLS,
	...DETAIL_CONTROLS,
	...MIXER_CONTROLS,
	...BAR_CONTROLS,
	...SWITCH_CONTROLS,
	control({ key: "keyGain", label: "Key output gain", value: 1, min: 0 }),
	control({ key: "windowType", label: "Window", min: 0, max: 3, step: 1 }),
	control({
		key: "logLow",
		label: "Low range",
		value: 0.25,
		min: 0.01,
		max: 0.49,
	}),
	control({
		key: "logHigh",
		label: "High range",
		value: 0.75,
		min: 0.51,
		max: 0.99,
	}),
];
export const CURVE_CHANNELS = [
	{
		key: "curveY",
		label: "Y",
		color: "var(--foreground)",
		family: "Custom",
		identity: true,
	},
	{
		key: "curveR",
		label: "R",
		color: "#ef747b",
		family: "Custom",
		identity: true,
	},
	{
		key: "curveG",
		label: "G",
		color: "#72d698",
		family: "Custom",
		identity: true,
	},
	{
		key: "curveB",
		label: "B",
		color: "#739dec",
		family: "Custom",
		identity: true,
	},
	{
		key: "hueHue",
		label: "Hue vs Hue",
		color: "var(--primary)",
		family: "Hue vs Hue",
		identity: false,
	},
	{
		key: "hueSat",
		label: "Hue vs Sat",
		color: "var(--primary)",
		family: "Hue vs Sat",
		identity: false,
	},
	{
		key: "hueLum",
		label: "Hue vs Lum",
		color: "var(--primary)",
		family: "Hue vs Lum",
		identity: false,
	},
	{
		key: "lumSat",
		label: "Lum vs Sat",
		color: "var(--foreground)",
		family: "Lum vs Sat",
		identity: false,
	},
	{
		key: "satSat",
		label: "Sat vs Sat",
		color: "var(--primary)",
		family: "Sat vs Sat",
		identity: false,
	},
	{
		key: "satLum",
		label: "Sat vs Lum",
		color: "var(--primary)",
		family: "Sat vs Lum",
		identity: false,
	},
];
export const CURVE_DEFAULTS = Object.fromEntries(
	CURVE_CHANNELS.map((c) => [
		c.key,
		JSON.stringify(c.identity ? [0, 0, 1, 1] : [0, 0.5, 1, 0.5]),
	]),
);

// Decode serialized control-point data at the UI/rendering boundary. Rust owns
// validation, sampling, and interpolation.
export function decodeCurve({
	value,
	identity,
}: {
	value: unknown;
	identity: boolean;
}): number[] {
	try {
		const parsed: unknown = JSON.parse(String(value));
		if (
			Array.isArray(parsed) &&
			parsed.length >= 4 &&
			parsed.length <= 128 &&
			parsed.length % 2 === 0 &&
			parsed.every((n) => typeof n === "number" && Number.isFinite(n))
		)
			return parsed;
	} catch {}
	return identity ? [0, 0, 1, 1] : [0, 0.5, 1, 0.5];
}

const decodedLuts = new Map<string, Record<string, number | number[]>>();

export function decodeLut({
	value,
}: {
	value: unknown;
}): Record<string, number | number[]> {
	if (typeof value !== "string" || !value) return { lutSize: 0 };
	const cached = decodedLuts.get(value);
	if (cached) return cached;
	try {
		const lut = JSON.parse(value);
		if (
			Number.isInteger(lut.size) &&
			lut.size >= 2 &&
			lut.size <= 65 &&
			Array.isArray(lut.values) &&
			lut.values.length === lut.size ** 3 * 3 &&
			lut.values.every(
				(n: unknown) => typeof n === "number" && Number.isFinite(n),
			) &&
			Array.isArray(lut.domainMin) &&
			Array.isArray(lut.domainMax) &&
			lut.domainMin.length === 3 &&
			lut.domainMax.length === 3 &&
			lut.domainMin.every(
				(n: unknown, i: number) =>
					typeof n === "number" &&
					Number.isFinite(n) &&
					Number.isFinite(lut.domainMax[i]) &&
					lut.domainMax[i] > n,
			)
		) {
			const decoded = {
				lutSize: lut.size,
				lutData: lut.values,
				lutMin: lut.domainMin,
				lutMax: lut.domainMax,
			};
			if (decodedLuts.size >= 4) decodedLuts.clear();
			decodedLuts.set(value, decoded);
			return decoded;
		}
	} catch {}
	return { lutSize: 0 };
}
