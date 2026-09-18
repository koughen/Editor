import { useEffect, useId, useRef, useState } from "react";

export function AudioControl({
	label,
	value,
	min,
	max,
	step = 0.1,
	unit = "",
	onChange,
	onCommit,
	disabled = false,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	unit?: string;
	onChange: (value: number) => void;
	onCommit: () => void;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className="audio-control">
			<label htmlFor={id}>{label}</label>
			<div className="audio-control-inputs">
				<input
					id={id}
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					disabled={disabled}
					onChange={(e) => onChange(Number(e.target.value))}
					onPointerUp={onCommit}
					onPointerCancel={onCommit}
					onKeyUp={onCommit}
					onBlur={onCommit}
				/>
				<div className="audio-number">
					<AudioNumber
						label={`${label} value`}
						value={value}
						min={min}
						max={max}
						step={step}
						disabled={disabled}
						onChange={onChange}
						onCommit={onCommit}
					/>
					<span>{unit}</span>
				</div>
			</div>
		</div>
	);
}

export function AudioNumber({
	label,
	value,
	min,
	max,
	step,
	disabled,
	onChange,
	onCommit,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	disabled?: boolean;
	onChange: (value: number) => void;
	onCommit: () => void;
}) {
	const focused = useRef(false);
	const [draft, setDraft] = useState(String(Number(value.toFixed(6))));
	useEffect(() => {
		if (!focused.current) setDraft(String(Number(value.toFixed(6))));
	}, [value]);
	return (
		<input
			aria-label={label}
			type="number"
			min={min}
			max={max}
			step={step}
			disabled={disabled}
			value={draft}
			onFocus={() => {
				focused.current = true;
			}}
			onChange={(event) => {
				setDraft(event.target.value);
				if (
					event.target.value !== "" &&
					Number.isFinite(event.target.valueAsNumber)
				)
					onChange(Math.min(max, Math.max(min, event.target.valueAsNumber)));
			}}
			onBlur={() => {
				focused.current = false;
				setDraft(String(Number(value.toFixed(6))));
				onCommit();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}}
		/>
	);
}
