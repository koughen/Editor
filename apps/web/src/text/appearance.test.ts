import { expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { measureTextElement } from "./measure-element";
import { drawMeasuredTextLayout } from "./primitives";
import type { TextElement } from "@/timeline";

test("outline and shadow render outside the original glyph bounds and survive title construction", () => {
	const styled = buildTextElement({
		raw: {
			...DEFAULTS.text.element,
			content: "Title",
			fontSize: 6,
			stroke: { color: "#ff0000", width: 5 },
			shadow: { color: "#ffffff", blur: 8, offsetX: 12, offsetY: 10 },
			isCaption: true,
			duration: mediaTimeFromSeconds({ seconds: 2 }),
		},
		startTime: ZERO_MEDIA_TIME,
	});
	if (styled.type !== "text") throw new Error("Expected text");
	expect(styled.isCaption).toBe(true);
	expect(styled.stroke?.width).toBe(5);
	const element: TextElement = { ...styled, id: "title" };
	const canvas = createCanvas(500, 240);
	const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
	const plain = measureTextElement({
		element: { ...element, stroke: undefined, shadow: undefined },
		canvasHeight: 1080,
		localTime: 0,
		ctx,
	});
	const measured = measureTextElement({
		element,
		canvasHeight: 1080,
		localTime: 0,
		ctx,
	});
	expect(measured.visualRect.width).toBeGreaterThan(
		plain.visualRect.width + 40,
	);
	ctx.translate(250, 120);
	drawMeasuredTextLayout({
		ctx,
		layout: measured,
		textColor: "#ffffff",
		stroke: element.stroke,
		shadow: element.shadow,
	});
	const data = ctx.getImageData(0, 0, 500, 240).data;
	let red = 0,
		visible = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] > data[i + 1] + 40 && data[i + 3] > 20) red++;
		if (data[i + 3] > 20) visible++;
	}
	expect(red).toBeGreaterThan(50);
	expect(visible).toBeGreaterThan(1000);
});
