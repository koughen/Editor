"use client";
import { parseCubeLut } from "opencut-wasm";
import { toast } from "sonner";
import { useRef, useState, type ReactNode } from "react";
import {
	Palette,
	Spline,
	SlidersHorizontal,
	Pipette,
	Circle,
	Droplets,
	KeyRound,
	Scan,
	BarChart3,
} from "lucide-react";
import type { NumberParamDefinition, ParamValues } from "@/params";
import type { VideoElement, ImageElement } from "@/timeline";
import {
	COLOR_WHEELS,
	PRIMARY_CONTROLS,
	COLOR_DEFAULTS,
} from "@/effects/definitions/color-grade";
import {
	ADVANCED_CONTROLS,
	QUALIFIER_CONTROLS,
	WINDOW_CONTROLS,
	DETAIL_CONTROLS,
	MIXER_CONTROLS,
	BAR_CONTROLS,
	control,
} from "../controls";
import { ColorWheel } from "./color-wheel";
import { GradeSlider } from "./grade-slider";
import { CurveEditor } from "./curve-editor";
import { QualifierPicker } from "./qualifier-picker";
import { TransformTab } from "@/rendering/components/transform-tab";

export const PALETTES = [
	{ id: "primaries", label: "Primaries", icon: Palette },
	{ id: "curves", label: "Curves", icon: Spline },
	{ id: "mixer", label: "RGB Mixer", icon: SlidersHorizontal },
	{ id: "qualifier", label: "Qualifier", icon: Pipette },
	{ id: "window", label: "Window", icon: Circle },
	{ id: "detail", label: "Blur / Sharpen", icon: Droplets },
	{ id: "key", label: "Key", icon: KeyRound },
	{ id: "sizing", label: "Sizing", icon: Scan },
	{ id: "lut", label: "LUT", icon: BarChart3 },
	{ id: "keyframes", label: "Keyframes", icon: KeyRound },
] as const;
export function ColorPalettes({
	params,
	patch,
	commit,
	element,
	trackId,
	keyframes,
}: {
	params: ParamValues;
	patch: (values: ParamValues) => void;
	commit: () => void;
	element: VideoElement | ImageElement;
	trackId: string;
	keyframes: ReactNode;
}) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [palette, setPalette] = useState<string>("primaries");
	const [primaryView, setMode] = useState("wheels");
	const mode =
		Number(params.logMode) > 0.5
			? "log"
			: primaryView === "bars"
				? "bars"
				: "wheels";
	const value = ({ key }: { key: string }) =>
		Number(params[key] ?? COLOR_DEFAULTS[key] ?? 0);
	const fields = ({
		controls,
		className = "",
	}: {
		controls: NumberParamDefinition[];
		className?: string;
	}) => (
		<div className={`grade-fields ${className}`}>
			{controls.map((param) => (
				<GradeSlider
					key={param.key}
					param={param}
					value={value({ key: param.key })}
					onPreview={(next) => patch({ [param.key]: next })}
					onCommit={commit}
				/>
			))}
		</div>
	);
	const toggle = ({ key, label }: { key: string; label: string }) => (
		<label className="grade-checkbox">
			<input
				type="checkbox"
				checked={value({ key }) > 0.5}
				onChange={(e) => {
					patch({ [key]: e.target.checked ? 1 : 0 });
					commit();
				}}
			/>
			{label}
		</label>
	);
	const reset = ({ keys }: { keys: string[] }) => {
		patch(
			Object.fromEntries(keys.map((key) => [key, COLOR_DEFAULTS[key] ?? 0])),
		);
		commit();
	};
	return (
		<div className="grade-palettes">
			<div
				className="grade-palette-tabs"
				role="tablist"
				aria-label="Color palettes"
			>
				{PALETTES.map(({ id, label, icon: Icon }) => (
					<button
						type="button"
						role="tab"
						aria-selected={palette === id}
						key={id}
						onClick={() => {
							commit();
							setPalette(id);
						}}
						title={label}
					>
						<Icon size={16} />
						<span>{label}</span>
					</button>
				))}
			</div>
			<div
				className="grade-palette-content"
				role="tabpanel"
				aria-label={PALETTES.find((p) => p.id === palette)?.label}
			>
				{palette === "primaries" && (
					<>
						<div className="grade-subtoolbar">
							<strong>Primaries</strong>
							<div className="grade-segmented">
								{["wheels", "bars", "log"].map((m) => (
									<button
										type="button"
										key={m}
										aria-pressed={mode === m}
										onClick={() => {
											setMode(m);
											patch({ logMode: m === "log" ? 1 : 0 });
											commit();
										}}
									>
										{m === "wheels"
											? "Color wheels"
											: m === "bars"
												? "Color bars"
												: "Log wheels"}
									</button>
								))}
							</div>
							<button
								type="button"
								onClick={() =>
									reset({
										keys: [
											...PRIMARY_CONTROLS,
											...ADVANCED_CONTROLS,
											...BAR_CONTROLS,
										]
											.map((p) => p.key)
											.concat(
												COLOR_WHEELS.flatMap((w) => [
													w.key,
													`${w.key}X`,
													`${w.key}Y`,
												]),
												["logMode", "logLow", "logHigh"],
											),
									})
								}
							>
								Reset primaries
							</button>
						</div>
						<div className="grade-wheels">
							{COLOR_WHEELS.map(({ key, label, description }) => (
								<div className="grade-wheel-column" key={key}>
									{mode === "bars" ? (
										<div className="grade-bars">
											<strong>{label}</strong>
											{fields({
												controls: BAR_CONTROLS.filter((p) =>
													p.key.startsWith(key),
												),
											})}
										</div>
									) : (
										<ColorWheel
											label={label}
											description={
												mode === "log" && key !== "offset"
													? "Log tonal range"
													: description
											}
											x={value({ key: `${key}X` })}
											y={value({ key: `${key}Y` })}
											onPreview={({ x, y }) =>
												patch({ [`${key}X`]: x, [`${key}Y`]: y })
											}
											onCommit={commit}
											onReset={() =>
												reset({
													keys: [
														key,
														`${key}X`,
														`${key}Y`,
														`${key}R`,
														`${key}G`,
														`${key}B`,
													],
												})
											}
										/>
									)}
									<GradeSlider
										param={control({ key, label: `${label} luminance` })}
										value={value({ key })}
										compact
										onPreview={(next) => patch({ [key]: next })}
										onCommit={commit}
									/>
								</div>
							))}
						</div>
						{mode === "log" &&
							fields({
								controls: [
									control({
										key: "logLow",
										label: "Low range",
										value: 0.25,
										min: 0.01,
										max: 0.49,
									}),
									control({
										key: "logHigh",
										label: "High range",
										value: 0.75,
										min: 0.51,
										max: 0.99,
									}),
								],
								className: "grade-fields-grid",
							})}
						{fields({
							controls: [...PRIMARY_CONTROLS, ...ADVANCED_CONTROLS],
							className: "grade-fields-grid grade-primary-fields",
						})}
					</>
				)}
				{palette === "curves" && (
					<CurveEditor params={params} patch={patch} commit={commit} />
				)}
				{palette === "mixer" && (
					<>
						<div className="grade-subtoolbar">
							<strong>RGB Mixer</strong>
							<button
								type="button"
								onClick={() =>
									reset({
										keys: MIXER_CONTROLS.map((p) => p.key).concat([
											"monochrome",
											"normalizeMixer",
											"preserveLuminance",
										]),
									})
								}
							>
								Reset mixer
							</button>
						</div>
						<div className="grade-mixer-grid">
							{[0, 1, 2].map((row) => (
								<div key={row}>
									<h3 style={{ color: ["#ef747b", "#72d698", "#739dec"][row] }}>
										{["Red", "Green", "Blue"][row]} output
									</h3>
									{fields({
										controls: MIXER_CONTROLS.filter((p) =>
											p.key.startsWith(`mix${row}`),
										),
									})}
								</div>
							))}
						</div>
						<div className="grade-options-row">
							{toggle({ key: "monochrome", label: "Monochrome" })}
							{toggle({
								key: "preserveLuminance",
								label: "Preserve luminance",
							})}
							{toggle({ key: "normalizeMixer", label: "Normalize channels" })}
						</div>
					</>
				)}
				{palette === "qualifier" && (
					<>
						<div className="grade-subtoolbar">
							<strong>Qualifier · HSL</strong>
							{toggle({ key: "qualifierEnabled", label: "Enable selection" })}
							{toggle({ key: "qualifierInvert", label: "Invert" })}
							<button
								type="button"
								onClick={() =>
									reset({
										keys: QUALIFIER_CONTROLS.map((p) => p.key).concat([
											"qualifierEnabled",
											"qualifierInvert",
										]),
									})
								}
							>
								Reset qualifier
							</button>
						</div>
						<p className="grade-help">
							Limit this node to a hue, saturation, and luminance range. Soften
							the edges to blend the correction.
						</p>
						<QualifierPicker patch={patch} commit={commit} />
						{fields({
							controls: QUALIFIER_CONTROLS,
							className: "grade-fields-grid",
						})}
						<div className="grade-hue-ramp" />
						<p className="grade-help">
							Hue: red 0.00 · yellow 0.17 · green 0.33 · cyan 0.50 · blue 0.67 ·
							magenta 0.83
						</p>
					</>
				)}
				{palette === "window" && (
					<>
						<div className="grade-subtoolbar">
							<strong>Power window</strong>
							<select
								aria-label="Window shape"
								value={value({ key: "windowType" })}
								onChange={(e) => {
									patch({ windowType: Number(e.target.value) });
									commit();
								}}
							>
								<option value={0}>None</option>
								<option value={1}>Circle / ellipse</option>
								<option value={2}>Rectangle</option>
								<option value={3}>Linear gradient</option>
							</select>
							{toggle({ key: "windowInvert", label: "Outside" })}
							<button
								type="button"
								onClick={() =>
									reset({
										keys: WINDOW_CONTROLS.map((p) => p.key).concat([
											"windowType",
											"windowInvert",
										]),
									})
								}
							>
								Reset window
							</button>
						</div>
						<p className="grade-help">
							The window limits this node's correction. It combines with the
							qualifier, preserving the rest of the image.
						</p>
						{fields({
							controls: WINDOW_CONTROLS,
							className: "grade-fields-grid",
						})}
					</>
				)}
				{palette === "detail" && (
					<>
						<div className="grade-subtoolbar">
							<strong>Blur / Sharpen</strong>
							<button
								type="button"
								onClick={() =>
									reset({
										keys: DETAIL_CONTROLS.map((p) => p.key).concat([
											"midtoneDetail",
										]),
									})
								}
							>
								Reset detail
							</button>
						</div>
						{fields({
							controls: [
								...DETAIL_CONTROLS,
								...ADVANCED_CONTROLS.filter((p) => p.key === "midtoneDetail"),
							],
							className: "grade-fields-grid",
						})}
						<p className="grade-help">
							Soften texture or enhance edges. The node's qualifier and window
							restrict where the effect is visible.
						</p>
					</>
				)}
				{palette === "key" && (
					<>
						<div className="grade-subtoolbar">
							<strong>Node key output</strong>
							<button
								type="button"
								onClick={() => reset({ keys: ["keyGain"] })}
							>
								Reset key
							</button>
						</div>
						{fields({
							controls: [
								control({
									key: "keyGain",
									label: "Output gain",
									value: 1,
									min: 0,
								}),
							],
						})}
						<p className="grade-help">
							Blend the entire node with its input. 0 bypasses the correction; 1
							applies it fully. Qualifiers and windows multiply this key.
						</p>
					</>
				)}
				{palette === "lut" && (
					<>
						<div className="grade-subtoolbar">
							<strong>3D LUT</strong>
							<button type="button" onClick={() => fileInput.current?.click()}>
								Import .cube
							</button>
							<button
								type="button"
								disabled={!params.lutData}
								onClick={() => {
									patch({ lutData: "", lutName: "", lutMix: 1 });
									commit();
								}}
							>
								Remove LUT
							</button>
						</div>
						<input
							hidden
							ref={fileInput}
							type="file"
							accept=".cube"
							onChange={async (e) => {
								const file = e.target.files?.[0];
								e.target.value = "";
								if (!file) return;
								try {
									if (file.size > 25_000_000)
										throw new Error("LUT file is too large");
									const lut = parseCubeLut({ text: await file.text() });
									patch({
										lutData: JSON.stringify(lut),
										lutName: file.name,
										lutMix: 1,
									});
									commit();
									toast.success("LUT loaded");
								} catch (error) {
									toast.error(String(error));
								}
							}}
						/>
						<p className="grade-help">
							{params.lutName
								? String(params.lutName)
								: "Import a 3D .cube LUT to transform this node's color. Tables from 2 to 65 points per axis retain their original resolution."}
						</p>
						{fields({
							controls: [
								control({ key: "lutMix", label: "LUT mix", value: 1, min: 0 }),
							],
						})}
					</>
				)}

				{palette === "keyframes" && keyframes}
				{palette === "sizing" && (
					<div className="grade-sizing">
						<TransformTab element={element} trackId={trackId} />
					</div>
				)}
			</div>
		</div>
	);
}
