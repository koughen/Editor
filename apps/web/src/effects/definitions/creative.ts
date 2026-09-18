import type { EffectDefinition } from "../types";
import { control } from "@/color/controls";
const looks = [
	{
		type: "vignette",
		name: "Vignette",
		mode: 1,
		amount: 0.7,
		max: 1,
		detail: 0.5,
		detailName: "Falloff",
		detailMax: 1,
	},
	{
		type: "film-grain",
		name: "Film grain",
		mode: 2,
		amount: 0.15,
		max: 1,
		detail: 1,
		detailName: "Grain size",
		detailMax: 8,
	},
	{
		type: "pixelate",
		name: "Pixelate",
		mode: 3,
		amount: 20,
		max: 120,
		detail: 1,
	},
	{
		type: "chromatic-aberration",
		name: "Chromatic aberration",
		mode: 4,
		amount: 6,
		max: 40,
		detail: 1,
	},
	{
		type: "sharpen",
		name: "Sharpen",
		mode: 5,
		amount: 0.7,
		max: 3,
		detail: 1,
		detailName: "Radius",
		detailMax: 5,
	},
	{ type: "sepia", name: "Sepia", mode: 6, amount: 1, max: 1, detail: 1 },
	{
		type: "posterize",
		name: "Posterize",
		mode: 7,
		amount: 6,
		max: 16,
		detail: 1,
	},
	{
		type: "duotone",
		name: "Midnight / gold",
		mode: 8,
		amount: 1,
		max: 1,
		detail: 1,
		detailName: "Tone curve",
		detailMax: 3,
	},
];
export const creativeEffects: EffectDefinition[] = looks.map((look) => ({
	type: look.type,
	name: look.name,
	keywords: [look.name, "creative", "style", "look"],
	params: [
		control({
			key: "amount",
			label:
				look.mode === 3 ? "Block size" : look.mode === 7 ? "Levels" : "Amount",
			value: look.amount,
			min: look.mode === 3 ? 1 : look.mode === 7 ? 2 : 0,
			max: look.max,
			step: look.max > 3 ? 1 : 0.01,
		}),
		...(look.detailName
			? [
					control({
						key: "detail",
						label: look.detailName,
						value: look.detail,
						min: 0.1,
						max: look.detailMax,
					}),
				]
			: []),
		control({ key: "mix", label: "Mix", value: 1, min: 0 }),
	],
	renderer: {
		passes: [
			{
				shader: "creative",
				uniforms: ({ effectParams }) => ({
					mode: look.mode,
					amount: Number(effectParams.amount ?? look.amount),
					detail: Number(effectParams.detail ?? look.detail),
					mix: Number(effectParams.mix ?? 1),
				}),
			},
		],
	},
}));
