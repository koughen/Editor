import {
	EXTRA_CONTROLS,
	CURVE_CHANNELS,
	CURVE_DEFAULTS,
	decodeCurve,
	decodeLut,
} from "@/color/controls";
import type { EffectDefinition } from "@/effects/types";
import type { NumberParamDefinition, ParamValues } from "@/params";

export const COLOR_GRADE_TYPE = "color-grade";
export const COLOR_WHEELS = [
	{ key: "lift", label: "Lift", description: "Shadows" },
	{ key: "gamma", label: "Gamma", description: "Midtones" },
	{ key: "gain", label: "Gain", description: "Highlights" },
	{ key: "offset", label: "Offset", description: "Global" },
] as const;

export const PRIMARY_CONTROLS: NumberParamDefinition[] = [
	{
		key: "temperature",
		label: "Temperature",
		type: "number",
		default: 0,
		min: -1,
		max: 1,
		step: 0.01,
	},
	{
		key: "tint",
		label: "Tint",
		type: "number",
		default: 0,
		min: -1,
		max: 1,
		step: 0.01,
	},
	{
		key: "exposure",
		label: "Exposure",
		type: "number",
		default: 0,
		min: -4,
		max: 4,
		step: 0.01,
	},
	{
		key: "contrast",
		label: "Contrast",
		type: "number",
		default: 1,
		min: 0,
		max: 2,
		step: 0.01,
	},
	{
		key: "pivot",
		label: "Pivot",
		type: "number",
		default: 0.18,
		min: 0.01,
		max: 1,
		step: 0.01,
	},
	{
		key: "saturation",
		label: "Saturation",
		type: "number",
		default: 1,
		min: 0,
		max: 2,
		step: 0.01,
	},
	{
		key: "shadows",
		label: "Shadows",
		type: "number",
		default: 0,
		min: -1,
		max: 1,
		step: 0.01,
	},
	{
		key: "highlights",
		label: "Highlights",
		type: "number",
		default: 0,
		min: -1,
		max: 1,
		step: 0.01,
	},
];

export const COLOR_PARAMS: NumberParamDefinition[] = [
	...PRIMARY_CONTROLS,
	...EXTRA_CONTROLS,
	...COLOR_WHEELS.flatMap(({ key, label }) => [
		{
			key,
			label: `${label} luminance`,
			type: "number" as const,
			default: 0,
			min: -1,
			max: 1,
			step: 0.01,
		},
		{
			key: `${key}X`,
			label: `${label} balance X`,
			type: "number" as const,
			default: 0,
			min: -1,
			max: 1,
			step: 0.01,
		},
		{
			key: `${key}Y`,
			label: `${label} balance Y`,
			type: "number" as const,
			default: 0,
			min: -1,
			max: 1,
			step: 0.01,
		},
	]),
];

export const COLOR_DEFAULTS: ParamValues = {
	...Object.fromEntries(
		COLOR_PARAMS.map((param) => [param.key, param.default]),
	),
	...CURVE_DEFAULTS,
};

export const colorGradeEffectDefinition: EffectDefinition = {
	type: COLOR_GRADE_TYPE,
	name: "Color correction",
	keywords: ["color", "grade", "exposure", "white balance", "saturation"],
	params: COLOR_PARAMS,
	renderer: {
		passes: [
			{
				shader: COLOR_GRADE_TYPE,
				uniforms: ({ effectParams }) =>
					Object.fromEntries([
						["monitorMatte", Number(effectParams.monitorMatte ?? 0)],
						...Object.entries(decodeLut({ value: effectParams.lutData })),
						...COLOR_PARAMS.map((param) => [
							param.key,
							typeof effectParams[param.key] === "number"
								? (effectParams[param.key] as number)
								: param.default,
						]),
						...CURVE_CHANNELS.map((channel) => [
							channel.key,
							decodeCurve({
								value: effectParams[channel.key],
								identity: channel.identity,
							}),
						]),
					]),
			},
		],
	},
};
