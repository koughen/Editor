"use client";

import { useRef, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";

export function ColorWheel({
	label,
	description,
	x,
	y,
	onPreview,
	onCommit,
	onReset,
}: {
	label: string;
	description: string;
	x: number;
	y: number;
	onPreview: (value: { x: number; y: number }) => void;
	onCommit: () => void;
	onReset: () => void;
}) {
	const dragging = useRef(false);
	const update = (event: PointerEvent<HTMLFieldSetElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const px = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
		const py =
			-(event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
		const length = Math.max(1, Math.hypot(px, py));
		onPreview({ x: px / length, y: py / length });
	};
	return (
		<div className="grade-wheel-group">
			<div className="grade-wheel-heading">
				<div>
					<strong>{label}</strong>
					<span>{description}</span>
				</div>
				<button
					type="button"
					className="grade-icon-button"
					aria-label={`Reset ${label}`}
					onClick={onReset}
				>
					<RotateCcw size={12} />
				</button>
			</div>
			<div className="grade-wheel-ring">
				<fieldset
					className="grade-wheel"
					aria-label={`${label} color balance`}
					onDoubleClick={onReset}
					onPointerDown={(event) => {
						event.preventDefault();
						dragging.current = true;
						event.currentTarget.setPointerCapture(event.pointerId);
						update(event);
					}}
					onPointerMove={(event) => {
						if (dragging.current) update(event);
					}}
					onPointerUp={(event) => {
						if (dragging.current) {
							update(event);
							dragging.current = false;
							onCommit();
							event.currentTarget.releasePointerCapture(event.pointerId);
						}
					}}
					onLostPointerCapture={() => {
						if (dragging.current) {
							dragging.current = false;
							onCommit();
						}
					}}
				>
					<span className="grade-wheel-cross" />
					<span
						className="grade-wheel-puck"
						style={{ left: `${50 + x * 46}%`, top: `${50 - y * 46}%` }}
					/>
				</fieldset>
			</div>
			<div className="grade-wheel-coordinates">
				{(["x", "y"] as const).map((axis) => (
					<label key={axis}>
						{axis.toUpperCase()}
						<input
							aria-label={`${label} balance ${axis.toUpperCase()}`}
							type="number"
							min={-1}
							max={1}
							step={0.01}
							value={Number((axis === "x" ? x : y).toFixed(2))}
							onChange={(event) => {
								const value = event.currentTarget.valueAsNumber;
								if (Number.isFinite(value))
									onPreview({ x, y, [axis]: Math.max(-1, Math.min(1, value)) });
							}}
							onBlur={onCommit}
							onKeyUp={(event) => {
								if (event.key === "Enter" || event.key.startsWith("Arrow"))
									onCommit();
							}}
						/>
					</label>
				))}
			</div>
		</div>
	);
}
