"use client";
import { useRef, useState } from "react";
import { CURVE_CHANNELS, decodeCurve } from "../controls";
import type { ParamValues } from "@/params";

export function CurveEditor({
	params,
	patch,
	commit,
}: {
	params: ParamValues;
	patch: (values: ParamValues) => void;
	commit: () => void;
}) {
	const [channelKey, setChannelKey] = useState("curveY");
	const [selected, setSelected] = useState(0);
	const graph = useRef<HTMLDivElement>(null);
	const dragging = useRef<number | null>(null);
	const channel =
		CURVE_CHANNELS.find((c) => c.key === channelKey) ?? CURVE_CHANNELS[0];
	const raw = decodeCurve({
		value: params[channelKey],
		identity: channel.identity,
	});
	const points = Array.from({ length: raw.length / 2 }, (_, i) => ({
		x: raw[i * 2],
		y: raw[i * 2 + 1],
	}));
	const current = useRef(points);
	current.current = points;
	const publish = (next: typeof points) => {
		current.current = next;
		patch({ [channelKey]: JSON.stringify(next.flatMap((p) => [p.x, p.y])) });
	};
	const move = ({ index, x, y }: { index: number; x: number; y: number }) => {
		const list = current.current;
		publish(
			list.map((p, i) =>
				i !== index
					? p
					: {
							x:
								i === 0
									? 0
									: i === list.length - 1
										? 1
										: Math.max(
												list[i - 1].x + 0.005,
												Math.min(list[i + 1].x - 0.005, x),
											),
							y: Math.max(0, Math.min(1, y)),
						},
			),
		);
	};
	const position = ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}) => {
		const r = graph.current?.getBoundingClientRect();
		if (!r?.width || !r.height) return { x: 0, y: 0 };
		return {
			x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
			y: Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height)),
		};
	};
	const remove = () => {
		if (selected > 0 && selected < points.length - 1) {
			publish(points.filter((_, i) => i !== selected));
			setSelected(0);
			commit();
		}
	};
	return (
		<div className="grade-curve-editor">
			<div className="grade-subtoolbar">
				<select
					aria-label="Curve channel"
					value={channelKey}
					onChange={(e) => {
						commit();
						setChannelKey(e.target.value);
						setSelected(0);
					}}
				>
					{CURVE_CHANNELS.map((c) => (
						<option value={c.key} key={c.key}>
							{c.family === "Custom" ? `Custom · ${c.label}` : c.label}
						</option>
					))}
				</select>
				<span>Click to add · Drag to shape · Arrow keys to fine-tune</span>
				<button
					type="button"
					onClick={() => {
						patch({
							[channelKey]: JSON.stringify(
								channel.identity ? [0, 0, 1, 1] : [0, 0.5, 1, 0.5],
							),
						});
						commit();
						setSelected(0);
					}}
				>
					Reset curve
				</button>
			</div>
			<div
				ref={graph}
				className={`grade-curve-graph ${channelKey.startsWith("hue") ? "hue-domain" : ""}`}
				onPointerDown={(e) => {
					if (e.target instanceof HTMLButtonElement) return;
					if (points.length >= 32) return;
					const p = position(e);
					const next = [...points, p].sort((a, b) => a.x - b.x);
					const index = next.indexOf(p);
					if (index === 0 || index === next.length - 1) return;
					publish(next);
					setSelected(index);
					dragging.current = index;
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					if (dragging.current !== null)
						move({ index: dragging.current, ...position(e) });
				}}
				onPointerUp={(e) => {
					if (dragging.current !== null) {
						dragging.current = null;
						commit();
						e.currentTarget.releasePointerCapture(e.pointerId);
					}
				}}
				onLostPointerCapture={() => {
					if (dragging.current !== null) {
						dragging.current = null;
						commit();
					}
				}}
			>
				<svg
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<path
						d={channel.identity ? "M0 100 L100 0" : "M0 50 L100 50"}
						stroke="var(--muted-foreground)"
						strokeWidth="0.35"
						strokeDasharray="2 2"
						fill="none"
					/>
					<polyline
						points={points
							.map((p) => `${p.x * 100},${(1 - p.y) * 100}`)
							.join(" ")}
						fill="none"
						stroke={channel.color}
						strokeWidth="0.7"
					/>
				</svg>
				{points.map((p, index) => (
					<button
						type="button"
						// biome-ignore lint/suspicious/noArrayIndexKey: Point order is the stable identity during a drag; coordinate keys would remount the focused handle.
						key={`${channelKey}-${index}`}
						className="grade-curve-point"
						style={{
							left: `${p.x * 100}%`,
							top: `${(1 - p.y) * 100}%`,
							borderColor: channel.color,
						}}
						aria-label={`Curve point ${index + 1}, input ${p.x.toFixed(2)}, output ${p.y.toFixed(2)}`}
						aria-pressed={selected === index}
						onPointerDown={(e) => {
							e.stopPropagation();
							setSelected(index);
							dragging.current = index;
							graph.current?.setPointerCapture(e.pointerId);
						}}
						onKeyDown={(e) => {
							if (e.key.startsWith("Arrow")) {
								e.preventDefault();
								setSelected(index);
								const step = e.shiftKey ? 0.05 : 0.01;
								move({
									index,
									x:
										p.x +
										(e.key === "ArrowRight"
											? step
											: e.key === "ArrowLeft"
												? -step
												: 0),
									y:
										p.y +
										(e.key === "ArrowUp"
											? step
											: e.key === "ArrowDown"
												? -step
												: 0),
								});
								commit();
							} else if (e.key === "Delete" || e.key === "Backspace") {
								e.preventDefault();
								if (index > 0 && index < points.length - 1) {
									publish(points.filter((_, i) => i !== index));
									setSelected(0);
									commit();
								}
							}
						}}
					/>
				))}
			</div>
			<div className="grade-curve-bottom">
				<span>Input →</span>
				<div>
					{(["x", "y"] as const).map((axis) => (
						<label key={axis}>
							{axis === "x" ? "Input" : "Output"}
							<input
								type="number"
								aria-label={`Curve point ${axis === "x" ? "input" : "output"}`}
								min={0}
								max={1}
								step={0.01}
								value={Number((points[selected]?.[axis] ?? 0).toFixed(3))}
								onChange={(e) => {
									const n = e.currentTarget.valueAsNumber;
									if (Number.isFinite(n) && points[selected])
										move({ index: selected, ...points[selected], [axis]: n });
								}}
								onBlur={commit}
							/>
						</label>
					))}
					<button
						type="button"
						disabled={selected === 0 || selected >= points.length - 1}
						onClick={remove}
					>
						Delete point
					</button>
				</div>
			</div>
		</div>
	);
}
