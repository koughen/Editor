import { test, expect } from "bun:test";
import { parseCubeLut, sampleColor } from "opencut-wasm";
import { decodeLut } from "./controls";
import { colorGradeEffectDefinition } from "@/effects/definitions/color-grade";

test("a Rust-parsed LUT survives project serialization and reaches the shader uniforms", () => {
	const lines = ["LUT_3D_SIZE 2"];
	for (let b = 0; b < 2; b++)
		for (let g = 0; g < 2; g++)
			for (let r = 0; r < 2; r++) lines.push(`${r} ${g} ${b}`);
	const lut = parseCubeLut({ text: lines.join("\n") });
	const saved = JSON.stringify(lut);
	const decoded = decodeLut({ value: saved });
	expect(decoded.lutSize).toBe(2);
	expect(decoded.lutData).toHaveLength(24);
	const uniforms = colorGradeEffectDefinition.renderer.passes[0].uniforms({
		effectParams: { lutData: saved, lutMix: 0.5, curveR: "[0,0,1,0.5]" },
		width: 1920,
		height: 1080,
	});
	expect(uniforms.lutSize).toBe(2);
	expect(uniforms.lutMix).toBe(0.5);
	expect(uniforms.curveR).toEqual([0, 0, 1, 0.5]);
	expect(uniforms.monitorMatte).toBe(0);
	const sample = sampleColor({ rgb: [255, 0, 0] });
	expect(sample[0]).toBe(0);
	expect(sample[1]).toBe(1);
	expect(sample[2]).toBeCloseTo(0.2126);
});
