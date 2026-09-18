import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorGradeEffectDefinition } from "./color-grade";
import { creativeEffects } from "./creative";
import { transitionDefinition } from "@/transitions/definition";

const defaultEffects = [
	blurEffectDefinition,
	colorGradeEffectDefinition,
	...creativeEffects,
	transitionDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register(definition.type, definition);
	}
}
