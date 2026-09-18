"use client";
import type { NumberParamDefinition } from "@/params";
export function GradeSlider({
	param,
	value,
	onPreview,
	onCommit,
	compact = false,
}: {
	param: NumberParamDefinition;
	value: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
	compact?: boolean;
}) {
	return (
		<div className={`grade-slider ${compact ? "grade-slider-compact" : ""}`}>
			<label htmlFor={`grade-${param.key}`}>
				{compact ? "Y" : param.label}
			</label>
			<input
				id={`grade-${param.key}`}
				aria-label={param.label}
				type="range"
				min={param.min}
				max={param.max}
				step={param.step}
				value={value}
				onChange={(event) => onPreview(Number(event.target.value))}
				onPointerUp={onCommit}
				onPointerCancel={onCommit}
				onBlur={onCommit}
				onKeyUp={onCommit}
				onDoubleClick={() => {
					onPreview(param.default);
					onCommit();
				}}
			/>
			<input
				aria-label={`${param.label} value`}
				type="number"
				min={param.min}
				max={param.max}
				step={param.step}
				value={Number(value.toFixed(2))}
				onChange={(event) => {
					const next = event.currentTarget.valueAsNumber;
					if (Number.isFinite(next))
						onPreview(
							Math.max(param.min, Math.min(param.max ?? Infinity, next)),
						);
				}}
				onBlur={onCommit}
				onKeyUp={(event) => {
					if (event.key === "Enter" || event.key.startsWith("Arrow"))
						onCommit();
				}}
			/>
		</div>
	);
}
