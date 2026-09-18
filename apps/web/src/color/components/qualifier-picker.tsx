"use client";
import { useEffect, useRef, useState } from "react";
import { sampleColor } from "opencut-wasm";
import { toast } from "sonner";
import type { ParamValues } from "@/params";
import { wasmCompositor } from "@/services/renderer/compositor/wasm-compositor";
import { useColorMonitorStore } from "../monitor-store";

export function QualifierPicker({
	patch,
	commit,
}: {
	patch: (values: ParamValues) => void;
	commit: () => void;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const matteVisible = useColorMonitorStore((state) => state.matte);
	const [sampled, setSampled] = useState<string | null>(null);
	useEffect(() => {
		const context = canvas.current?.getContext("2d", {
			willReadFrequently: true,
		});
		if (!context) return;
		const draw = () => {
			try {
				const source = wasmCompositor.getCanvas();
				context.clearRect(0, 0, 256, 144);
				context.drawImage(source, 0, 0, 256, 144);
			} catch {
				/* Viewer may not yet have a frame. */
			}
		};
		draw();
		const timer = window.setInterval(draw, 200);
		return () => window.clearInterval(timer);
	}, []);
	const pick = ({ x, y }: { x: number; y: number }) => {
		try {
			const context = canvas.current?.getContext("2d");
			if (!context) return;
			const [r, g, b, alpha] = context.getImageData(
				Math.min(255, Math.max(0, Math.floor(x * 256))),
				Math.min(143, Math.max(0, Math.floor(y * 144))),
				1,
				1,
			).data;
			if (!alpha) return;
			const [hue, saturation, luminance] = sampleColor({ rgb: [r, g, b] });
			patch({
				qualifierEnabled: 1,
				qualifierInvert: 0,
				qualifierHue: hue,
				qualifierWidth: saturation < 0.02 ? 1 : 0.12,
				satLow: Math.max(0, saturation - 0.15),
				satHigh: Math.min(1, saturation + 0.15),
				lumLow: Math.max(0, luminance - 0.15),
				lumHigh: Math.min(1, luminance + 0.15),
			});
			commit();
			setSampled(`rgb(${r}, ${g}, ${b})`);
		} catch {
			toast.error("Could not sample this frame");
		}
	};
	return (
		<div className="grade-qualifier-picker">
			<button
				type="button"
				disabled={matteVisible}
				aria-label="Pick qualifier color from viewer; Enter samples the center"
				onClick={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					pick({
						x: e.detail === 0 ? 0.5 : (e.clientX - rect.left) / rect.width,
						y: e.detail === 0 ? 0.5 : (e.clientY - rect.top) / rect.height,
					});
				}}
			>
				<canvas ref={canvas} width={256} height={144} />
			</button>
			<p>
				{matteVisible
					? "Turn off Highlight matte to pick a color."
					: "Click a color to set the qualifier ranges."}
				<br />
				Samples the composited viewer; refine the selection below.
				{sampled && (
					<span
						role="img"
						style={{ background: sampled }}
						aria-label={`Sampled ${sampled}`}
					/>
				)}
			</p>
		</div>
	);
}
