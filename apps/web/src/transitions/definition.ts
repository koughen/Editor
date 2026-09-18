import type { EffectDefinition } from "@/effects/types";
import { control } from "@/color/controls";
import { TICKS_PER_SECOND } from "@/wasm";
export const TRANSITION_TYPE = "clip-transition";
export const TRANSITIONS = [
	{ id: 0, name: "None" },
	{ id: 1, name: "Cross dissolve" },
	{ id: 2, name: "Dip to black" },
	{ id: 3, name: "Dip to white" },
	{ id: 4, name: "Wipe left to right" },
	{ id: 5, name: "Wipe right to left" },
	{ id: 6, name: "Iris" },
	{ id: 7, name: "Zoom dissolve" },
];
export const transitionDefinition: EffectDefinition = {
	type: TRANSITION_TYPE,
	name: "Clip transitions",
	keywords: ["transition", "fade", "wipe"],
	params: [
		control({ key: "inMode", label: "Entrance type", min: 0, max: 7, step: 1 }),
		control({
			key: "inDuration",
			label: "Entrance seconds",
			value: 0.5,
			min: 0,
			max: 5,
		}),
		control({ key: "outMode", label: "Exit type", min: 0, max: 7, step: 1 }),
		control({
			key: "outDuration",
			label: "Exit seconds",
			value: 0.5,
			min: 0,
			max: 5,
		}),
	],
	renderer: {
		passes: [
			{
				shader: TRANSITION_TYPE,
				uniforms: ({ effectParams }) => ({
					inMode: Number(effectParams.inMode ?? 0),
					inDuration: Number(effectParams.inDuration ?? 0.5),
					outMode: Number(effectParams.outMode ?? 0),
					outDuration: Number(effectParams.outDuration ?? 0.5),
					time: Number(effectParams.localTime ?? 0) / TICKS_PER_SECOND,
					duration:
						Number(effectParams.clipDuration ?? TICKS_PER_SECOND) /
						TICKS_PER_SECOND,
				}),
			},
		],
	},
};
