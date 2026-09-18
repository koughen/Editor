"use client";
import { useState } from "react";
import { audioAutomationValue } from "opencut-wasm";
import { useEditor } from "@/editor/use-editor";
import { TICKS_PER_SECOND } from "@/wasm";
import type { SceneTracks } from "@/timeline";
import { getAudioTracks } from "../settings";
import type {
	AudioMixSettings,
	CleanupSettings,
	AutomationPoint,
} from "../types";
import { AudioControl, AudioNumber } from "./audio-control";
import { NativePlugins } from "./native-plugins";
type Props = {
	settings: AudioMixSettings;
	onChange: (patch: Partial<AudioMixSettings>) => void;
	onCommit: () => void;
};
export function AdvancedEffects({
	settings: s,
	onChange,
	onCommit,
	tracks,
	channelId,
}: Props & { tracks: SceneTracks; channelId: string }) {
	const update = (patch: Partial<CleanupSettings>) =>
		onChange({ cleanup: { ...s.cleanup, ...patch } });
	const controls = (
		fields: [keyof CleanupSettings, string, number, number, number, string][],
		disabled: boolean,
	) =>
		fields.map(([key, label, min, max, step, unit]) => (
			<AudioControl
				key={key}
				label={label}
				value={s.cleanup[key] as number}
				min={min}
				max={max}
				step={step}
				unit={unit}
				disabled={disabled || s.bypass}
				onChange={(v) => update({ [key]: v })}
				onCommit={onCommit}
			/>
		));
	const section = (
		label: string,
		enabled: keyof CleanupSettings,
		fields: [keyof CleanupSettings, string, number, number, number, string][],
		hint: string,
	) => (
		<details className="audio-advanced-section">
			<summary>
				<span>{label}</span>
				<small>{s.cleanup[enabled] ? "ON" : "OFF"}</small>
			</summary>
			<label className="audio-toggle">
				<input
					type="checkbox"
					checked={Boolean(s.cleanup[enabled])}
					onChange={(e) => {
						update({ [enabled]: e.target.checked });
						onCommit();
					}}
				/>
				Enable {label.toLowerCase()}
			</label>
			<p className="audio-effect-hint">{hint}</p>
			{controls(fields, !s.cleanup[enabled])}
		</details>
	);
	return (
		<>
			<details className="audio-advanced-section">
				<summary>Effects order</summary>
				<p className="audio-effect-hint">Signal flows from top to bottom.</p>
				{s.effectOrder.map((name, i) => (
					<div className="audio-order-row" key={name}>
						<span>
							{i + 1}.{" "}
							{
								(
									{
										cleanup: "Cleanup & ducking",
										eq: "Channel EQ",
										compressor: "Compressor",
										reverb: "Reverb",
										delay: "Delay",
									} as Record<string, string>
								)[name]
							}
						</span>
						{[-1, 1].map((dir) => (
							<button
								key={dir}
								type="button"
								aria-label={`Move ${name} ${dir < 0 ? "up" : "down"}`}
								disabled={i + dir < 0 || i + dir >= s.effectOrder.length}
								onClick={() => {
									const order = [...s.effectOrder];
									[order[i], order[i + dir]] = [order[i + dir], order[i]];
									onChange({ effectOrder: order });
									onCommit();
								}}
							>
								{dir < 0 ? "↑" : "↓"}
							</button>
						))}
					</div>
				))}
			</details>
			{section(
				"Noise reduction",
				"noiseEnabled",
				[
					["noiseFloor", "Noise floor", -80, -20, 1, "dB"],
					["noiseReduction", "Reduction", 0, 30, 1, "dB"],
				],
				"Multiband suppression for steady background hiss. Set the floor just above the noise; higher reduction can soften quiet detail.",
			)}
			{section(
				"Gate / expander",
				"gateEnabled",
				[
					["gateThreshold", "Threshold", -80, 0, 1, "dB"],
					["gateRatio", "Ratio", 1, 20, 0.1, ":1"],
					["gateAttack", "Attack", 0.1, 100, 0.1, "ms"],
					["gateRelease", "Release", 10, 2000, 10, "ms"],
				],
				"Lower the level between phrases. A low ratio gives a gentle expansion; a high ratio acts as a gate.",
			)}
			{section(
				"De-esser",
				"deessEnabled",
				[
					["deessFrequency", "Split frequency", 2000, 12000, 100, "Hz"],
					["deessThreshold", "Threshold", -60, 0, 1, "dB"],
					["deessAmount", "Maximum reduction", 0, 18, 0.5, "dB"],
				],
				"Tame sibilance above the split frequency while preserving the lower voice.",
			)}
			<details className="audio-advanced-section">
				<summary>
					<span>Music ducking</span>
					<small>{s.cleanup.duckEnabled ? "ON" : "OFF"}</small>
				</summary>
				<label className="audio-toggle">
					<input
						type="checkbox"
						checked={s.cleanup.duckEnabled}
						onChange={(e) => {
							update({ duckEnabled: e.target.checked });
							onCommit();
						}}
					/>
					Enable ducking
				</label>
				<label className="audio-select-label">
					Listen to
					<select
						value={s.duckSource}
						onChange={(e) => {
							onChange({ duckSource: e.target.value });
							onCommit();
						}}
					>
						<option value="">Choose dialogue track…</option>
						{getAudioTracks({ tracks })
							.filter((t) => t.id !== channelId)
							.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
					</select>
				</label>
				<p className="audio-effect-hint">
					The selected track lowers this channel automatically. The detector
					listens before its fader; muting the source stops ducking.
				</p>
				{controls(
					[
						["duckThreshold", "Trigger threshold", -60, 0, 1, "dB"],
						["duckAmount", "Reduction", 0, 36, 1, "dB"],
						["duckAttack", "Attack", 1, 500, 1, "ms"],
						["duckRelease", "Release", 20, 3000, 10, "ms"],
					],
					!s.cleanup.duckEnabled,
				)}
			</details>
			<details className="audio-advanced-section">
				<summary>
					<span>Additional EQ bands</span>
					<small>{s.bands.length}/8</small>
				</summary>
				{s.bands.map((band, i) => {
					const edit = (patch: Partial<typeof band>) =>
						onChange({
							bands: s.bands.map((b, j) => (i === j ? { ...b, ...patch } : b)),
						});
					return (
						<div className="audio-extra-band" key={band.id}>
							<div className="audio-order-row">
								<label className="audio-toggle">
									<input
										type="checkbox"
										checked={band.enabled}
										onChange={(e) => {
											edit({ enabled: e.target.checked });
											onCommit();
										}}
									/>
									Band {i + 1}
								</label>
								<button
									type="button"
									aria-label={`Remove band ${i + 1}`}
									onClick={() => {
										const automation: typeof s.automation = {};
										for (const [key, value] of Object.entries(s.automation)) {
											const match = key.match(/^band:(\d+):(.+)$/);
											if (!match) automation[key] = value;
											else if (Number(match[1]) !== i)
												automation[
													`band:${Number(match[1]) > i ? Number(match[1]) - 1 : match[1]}:${match[2]}`
												] = value;
										}
										onChange({
											bands: s.bands.filter((_, j) => j !== i),
											automation,
										});
										onCommit();
									}}
								>
									×
								</button>
							</div>
							<select
								aria-label={`Band ${i + 1} filter type`}
								value={band.kind}
								onChange={(e) => {
									edit({ kind: e.target.value as BiquadFilterType });
									onCommit();
								}}
							>
								{[
									"peaking",
									"lowshelf",
									"highshelf",
									"highpass",
									"lowpass",
									"notch",
								].map((k) => (
									<option key={k} value={k}>
										{k}
									</option>
								))}
							</select>
							{(
								[
									["frequency", "Frequency", 20, 20000, 1, "Hz"],
									["gain", "Gain", -24, 24, 0.1, "dB"],
									["q", "Q / width", 0.1, 18, 0.1, ""],
								] as const
							).map(([key, label, min, max, step, unit]) => (
								<AudioControl
									key={key}
									label={label}
									value={band[key]}
									min={min}
									max={max}
									step={step}
									unit={unit}
									disabled={!band.enabled || s.bypass || !s.eqEnabled}
									onChange={(v) => edit({ [key]: v })}
									onCommit={onCommit}
								/>
							))}
						</div>
					);
				})}
				<button
					className="audio-wide-button"
					type="button"
					disabled={s.bands.length >= 8}
					onClick={() => {
						onChange({
							bands: [
								...s.bands,
								{
									id: crypto.randomUUID(),
									kind: "peaking",
									frequency: 1000,
									gain: 0,
									q: 1,
									enabled: true,
								},
							],
						});
						onCommit();
					}}
				>
					+ Add EQ band
				</button>
			</details>
			{!tracks.audioBuses?.some((b) => b.id === channelId) && (
				<NativePlugins settings={s} onChange={onChange} onCommit={onCommit} />
			)}
		</>
	);
}
const PARAMETERS: [string, string, number, number, number][] = [
	["gainDb", "Volume", -60, 12, 0.1],
	["pan", "Pan", -1, 1, 0.01],
	["highPass", "Low cut", 20, 1000, 1],
	["lowGain", "Low shelf", -18, 18, 0.1],
	["lowMidFreq", "Low-mid frequency", 80, 2000, 1],
	["lowMidGain", "Low-mid gain", -18, 18, 0.1],
	["highMidFreq", "High-mid frequency", 500, 12000, 1],
	["highMidGain", "High-mid gain", -18, 18, 0.1],
	["highGain", "High shelf", -18, 18, 0.1],
	["threshold", "Compressor threshold", -60, 0, 0.5],
	["ratio", "Compressor ratio", 1, 20, 0.1],
	["attack", "Compressor attack", 0.1, 200, 0.1],
	["release", "Compressor release", 10, 1000, 1],
	["makeup", "Makeup gain", 0, 18, 0.1],
	["reverbMix", "Reverb send", 0, 1, 0.01],
	["delayMix", "Delay send", 0, 1, 0.01],
	["delayTime", "Delay time", 10, 1000, 1],
	["delayFeedback", "Delay feedback", 0, 0.85, 0.01],
];
export function TrackAutomation({ settings: s, onChange, onCommit }: Props) {
	const editor = useEditor();
	const [key, setKey] = useState("gainDb");
	const [draftTime, setDraftTime] = useState(0);
	const choices = [
		...PARAMETERS,
		...s.bands.flatMap(
			(_, i) =>
				[
					[`band:${i}:frequency`, `Band ${i + 1} frequency`, 20, 20000, 1],
					[`band:${i}:gain`, `Band ${i + 1} gain`, -24, 24, 0.1],
					[`band:${i}:q`, `Band ${i + 1} Q`, 0.1, 18, 0.1],
				] as [string, string, number, number, number][],
		),
	];
	const field = choices.find((c) => c[0] === key) ?? choices[0];
	const points = s.automation[field[0]] ?? [];
	const duration = editor.timeline.getTotalDuration() / TICKS_PER_SECOND;
	const setPoints = (p: AutomationPoint[]) =>
		onChange({ automation: { ...s.automation, [field[0]]: p } });
	const base = key.startsWith("band:")
		? Number(
				s.bands[Number(key.split(":")[1])]?.[key.split(":")[2] as "gain"] ?? 0,
			)
		: Number(s[key as keyof AudioMixSettings] ?? 0);
	const add = (time: number) => {
		setPoints([
			...points.filter((p) => Math.abs(p.time - time) > 0.0001),
			{
				id: crypto.randomUUID(),
				time,
				value: audioAutomationValue(points, time, base),
			},
		]);
		onCommit();
	};
	return (
		<div className="audio-automation-editor">
			<label className="audio-toggle">
				<input
					type="checkbox"
					checked={s.automationEnabled}
					onChange={(e) => {
						onChange({ automationEnabled: e.target.checked });
						onCommit();
					}}
				/>
				Read automation
			</label>
			<label className="audio-select-label">
				Parameter
				<select value={field[0]} onChange={(e) => setKey(e.target.value)}>
					{choices.map(([value, label]) => (
						<option key={value} value={value}>
							{label}
							{s.automation[value]?.length ? " ◆" : ""}
						</option>
					))}
				</select>
			</label>
			<p className="audio-effect-hint">
				Points use timeline time in seconds. Automation overrides the static
				control while Read is on.
			</p>
			<svg
				className="audio-automation-graph"
				viewBox="0 0 300 100"
				role="img"
				aria-label={`${field[1]} automation curve`}
			>
				<title>{field[1]} automation</title>
				{[0, 50, 100].map((y) => (
					<line key={y} x1={0} x2={300} y1={y} y2={y} />
				))}
				<path
					d={Array.from(
						{ length: 151 },
						(_, i) =>
							`${i ? "L" : "M"}${i * 2},${100 - ((audioAutomationValue(points, (i / 150) * Math.max(duration, 1), base) - field[2]) / (field[3] - field[2])) * 100}`,
					).join(" ")}
				/>
				{points.map((p) => (
					<circle
						key={p.id}
						cx={(p.time / Math.max(duration, 1)) * 300}
						cy={100 - ((p.value - field[2]) / (field[3] - field[2])) * 100}
						r={3}
					/>
				))}
			</svg>
			<div className="audio-order-row">
				<span>0:00</span>
				<span>{duration.toFixed(2)}s</span>
			</div>
			<button
				className="audio-wide-button"
				type="button"
				onClick={() => add(editor.playback.getCurrentTime() / TICKS_PER_SECOND)}
			>
				+ Point at playhead
			</button>
			<div className="audio-point-add">
				<AudioNumber
					label="New point time in seconds"
					value={draftTime}
					min={0}
					max={Math.max(duration, 1)}
					step={0.01}
					onChange={setDraftTime}
					onCommit={() => {}}
				/>
				<button type="button" onClick={() => add(draftTime)}>
					Add at time
				</button>
			</div>
			{points.map((p, i) => (
				<div className="audio-automation-point" key={`${key}:${p.id}`}>
					<div className="audio-point-label">
						Time
						<AudioNumber
							label={`Point ${i + 1} time`}
							value={p.time}
							min={0}
							max={Math.max(duration, p.time)}
							step={0.01}
							onChange={(time) =>
								setPoints(points.map((v, j) => (i === j ? { ...v, time } : v)))
							}
							onCommit={onCommit}
						/>
					</div>
					<div className="audio-point-label">
						Value
						<AudioNumber
							label={`Point ${i + 1} value`}
							value={p.value}
							min={field[2]}
							max={field[3]}
							step={field[4]}
							onChange={(value) =>
								setPoints(points.map((v, j) => (i === j ? { ...v, value } : v)))
							}
							onCommit={onCommit}
						/>
					</div>
					<select
						aria-label={`Point ${i + 1} transition`}
						value={p.hold ? "hold" : "linear"}
						onChange={(e) => {
							setPoints(
								points.map((v, j) =>
									i === j ? { ...v, hold: e.target.value === "hold" } : v,
								),
							);
							onCommit();
						}}
					>
						<option value="linear">Ramp</option>
						<option value="hold">Hold</option>
					</select>
					<button
						type="button"
						aria-label={`Delete point ${i + 1}`}
						onClick={() => {
							setPoints(points.filter((_, j) => j !== i));
							onCommit();
						}}
					>
						×
					</button>
				</div>
			))}
			{points.length > 0 && (
				<button
					className="audio-wide-button"
					type="button"
					onClick={() => {
						setPoints([]);
						onCommit();
					}}
				>
					Clear this lane
				</button>
			)}
		</div>
	);
}
export function ChannelRouting({
	settings: s,
	onChange,
	onCommit,
	tracks,
	channelId,
	onRename,
	onDelete,
}: Props & {
	tracks: SceneTracks;
	channelId: string;
	onRename?: (name: string) => void;
	onDelete?: () => void;
}) {
	const bus = tracks.audioBuses?.find((b) => b.id === channelId);
	const groups = tracks.audioBuses?.filter((b) => b.kind === "group") ?? [];
	const returns = tracks.audioBuses?.filter((b) => b.kind === "return") ?? [];
	return (
		<div className="audio-routing-editor">
			{bus && (
				<>
					<label className="audio-select-label">
						Bus name
						<input
							defaultValue={bus.name}
							key={bus.id}
							onBlur={(e) => onRename?.(e.target.value.trim() || bus.name)}
						/>
					</label>
					<p className="audio-effect-hint">
						{bus.kind === "return"
							? "Shared return. Send tracks here for one shared effect."
							: "Group bus. Tracks routed here share processing and a fader."}
					</p>
				</>
			)}
			{channelId !== "master" && (
				<label className="audio-select-label">
					Output
					<select
						value={bus ? "master" : s.outputId}
						disabled={!!bus}
						onChange={(e) => {
							onChange({ outputId: e.target.value });
							onCommit();
						}}
					>
						<option value="master">Stereo out</option>
						{!bus &&
							groups.map((b) => (
								<option key={b.id} value={b.id}>
									{b.name}
								</option>
							))}
					</select>
				</label>
			)}
			{bus?.kind === "return" && (
				<label className="audio-toggle">
					<input
						type="checkbox"
						checked={s.wetOnly}
						onChange={(e) => {
							onChange({ wetOnly: e.target.checked });
							onCommit();
						}}
					/>
					Wet only (no dry signal)
				</label>
			)}
			{channelId !== "master" && bus?.kind !== "return" && (
				<>
					<h3>Shared sends</h3>
					{returns.length === 0 && (
						<p className="audio-effect-hint">
							Add a return using “+ Return” above the mixer.
						</p>
					)}
					{returns.map((b) => {
						const send = s.sends.find((v) => v.busId === b.id);
						const update = (patch: Partial<NonNullable<typeof send>>) =>
							onChange({
								sends: [
									...s.sends.filter((v) => v.busId !== b.id),
									{
										busId: b.id,
										levelDb: -12,
										preFader: false,
										...send,
										...patch,
									},
								],
							});
						return (
							<div className="audio-send" key={b.id}>
								<label className="audio-toggle">
									<input
										type="checkbox"
										checked={!!send}
										onChange={(e) => {
											if (e.target.checked) update({});
											else
												onChange({
													sends: s.sends.filter((v) => v.busId !== b.id),
												});
											onCommit();
										}}
									/>
									{b.name}
								</label>
								{send && (
									<>
										<AudioControl
											label="Send level"
											value={send.levelDb}
											min={-60}
											max={12}
											step={0.5}
											unit="dB"
											onChange={(levelDb) => update({ levelDb })}
											onCommit={onCommit}
										/>
										<label className="audio-toggle">
											<input
												type="checkbox"
												checked={send.preFader}
												onChange={(e) => {
													update({ preFader: e.target.checked });
													onCommit();
												}}
											/>
											Pre-fader
										</label>
									</>
								)}
							</div>
						);
					})}
				</>
			)}
			{onDelete && (
				<button type="button" className="audio-wide-button" onClick={onDelete}>
					Remove bus · route tracks to stereo out
				</button>
			)}
			<p className="audio-effect-hint">
				Groups and returns feed stereo out. Mute suppresses sends; soloing a
				group includes its tracks.
			</p>
		</div>
	);
}
