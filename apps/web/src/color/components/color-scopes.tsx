"use client";

import { useEffect, useRef, useState } from "react";
import { buildColorScope } from "opencut-wasm";
import { wasmCompositor } from "@/services/renderer/compositor/wasm-compositor";

export function ColorScopes() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [mode, setMode] = useState("waveform");
	const [brightness, setBrightness] = useState(1);
	const [scale, setScale] = useState("ire");
	const [unavailable, setUnavailable] = useState(false);
	useEffect(() => {
		const sample = document.createElement("canvas");
		sample.width = 256;
		sample.height = 144;
		const context = sample.getContext("2d", { willReadFrequently: true });
		const output = canvasRef.current?.getContext("2d");
		if (!context || !output) return;
		const draw = () => {
			try {
				const source = wasmCompositor.getCanvas();
				context.clearRect(0, 0, 256, 144);
				context.drawImage(source, 0, 0, 256, 144);
				const rgba = context.getImageData(0, 0, 256, 144).data;
				const pixels = buildColorScope({
					rgba: new Uint8Array(rgba.buffer),
					width: 256,
					mode,
				});
				output.putImageData(
					new ImageData(new Uint8ClampedArray(pixels), 256, 128),
					0,
					0,
				);
				setUnavailable(false);
			} catch {
				output.clearRect(0, 0, 256, 128);
				setUnavailable(true);
			}
		};
		draw();
		const timer = window.setInterval(draw, 150);
		return () => window.clearInterval(timer);
	}, [mode]);
	return (
		<section className="grade-scopes" aria-label="Video scopes">
			<div className="grade-section-heading">
				<strong>Scopes</strong>
				<select
					aria-label="Scope type"
					value={mode}
					onChange={(event) => setMode(event.target.value)}
				>
					<option value="waveform">Luma waveform</option>
					<option value="parade">RGB parade</option>
					<option value="rgb">RGB waveform</option>
					<option value="histogram">Histogram</option>
					<option value="vectorscope">Vectorscope</option>
				</select>
			</div>
			<div
				className={`grade-scope-plot ${mode === "vectorscope" ? "grade-vector-plot" : ""}`}
			>
				{mode !== "vectorscope" && mode !== "histogram" && (
					<div className="grade-scope-scale">
						{[1, 0.75, 0.5, 0.25, 0].map((v) => (
							<span key={v}>
								{Math.round(
									v * (scale === "10bit" ? 1023 : scale === "8bit" ? 255 : 100),
								)}
							</span>
						))}
					</div>
				)}
				{mode === "vectorscope" && (
					<div className="grade-vector-graticule">
						<span>R</span>
						<span>Y</span>
						<span>G</span>
						<span>C</span>
						<span>B</span>
						<span>M</span>
					</div>
				)}

				<canvas
					ref={canvasRef}
					width={256}
					height={128}
					style={{ filter: `brightness(${brightness})` }}
					aria-label={`${mode} of the viewer`}
				/>
				{unavailable && (
					<span className="grade-scope-empty">Waiting for the viewer</span>
				)}
			</div>
			<div className="grade-scope-options">
				<label>
					Brightness
					<input
						aria-label="Scope brightness"
						type="range"
						min={0.25}
						max={3}
						step={0.05}
						value={brightness}
						onChange={(e) => setBrightness(Number(e.target.value))}
					/>
				</label>
				<select
					aria-label="Scope scale"
					value={scale}
					onChange={(e) => setScale(e.target.value)}
				>
					<option value="ire">IRE</option>
					<option value="8bit">8-bit</option>
					<option value="10bit">10-bit</option>
				</select>
			</div>
			<p>
				{mode === "vectorscope"
					? "Cb/Cr chroma · Rec.709"
					: mode === "histogram"
						? "RGB pixel distribution · Black → White"
						: "Viewer output · Full range"}
			</p>
		</section>
	);
}
