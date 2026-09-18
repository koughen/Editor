"use client";

import Image from "next/image";
import { safeExportFileName } from "opencut-wasm";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
	ArrowUpRight,
	Check,
	Download,
	FolderOutput,
	Loader2,
	RotateCcw,
	Volume2,
	X,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import {
	downloadBuffer,
	getExportMimeType,
	type ExportOptions,
} from "@/export";
import { resolveSettings } from "@/export/settings";
import {
	canOpenHandoff,
	exportHandoff,
	planHandoff,
	type HandoffMode,
	type HandoffTarget,
} from "@/export/handoff";
import { TICKS_PER_SECOND } from "@/wasm";
import { DEFAULT_LOGO_URL } from "@/site/brand";

type Destination = "video" | HandoffTarget;
const destinations: { id: Destination; label: string; detail: string }[] = [
	{ id: "video", label: "Video file", detail: "Render your finished edit" },
	{ id: "capcut", label: "CapCut", detail: "Draft + media · experimental" },
	{
		id: "after-effects",
		label: "After Effects",
		detail: "Composition + import script",
	},
	{ id: "premiere", label: "Premiere Pro", detail: "Editable XML timeline" },
	{
		id: "resolve",
		label: "DaVinci Resolve",
		detail: "XML timeline + import script",
	},
];
const fpsChoices = [
	{ label: "23.976", numerator: 24000, denominator: 1001 },
	{ label: "24", numerator: 24, denominator: 1 },
	{ label: "25", numerator: 25, denominator: 1 },
	{ label: "29.97", numerator: 30000, denominator: 1001 },
	{ label: "30", numerator: 30, denominator: 1 },
	{ label: "50", numerator: 50, denominator: 1 },
	{ label: "59.94", numerator: 60000, denominator: 1001 },
	{ label: "60", numerator: 60, denominator: 1 },
];

function SelectField({
	label,
	value,
	onChange,
	children,
	hint,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	children: ReactNode;
	hint?: string;
}) {
	const id = useId();
	return (
		<div className="min-w-0 space-y-1 border border-border bg-background p-3 focus-within:border-primary">
			<label
				htmlFor={id}
				className="block text-[10px] uppercase tracking-wider text-muted-foreground"
			>
				{label}
			</label>
			<select
				id={id}
				aria-describedby={hint ? `${id}-hint` : undefined}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-8 w-full min-w-0 cursor-pointer bg-transparent font-mono text-sm text-foreground outline-none focus-visible:outline focus-visible:outline-primary focus-visible:outline-offset-2"
			>
				{children}
			</select>
			{hint && (
				<p
					id={`${id}-hint`}
					className="text-[11px] leading-4 text-muted-foreground"
				>
					{hint}
				</p>
			)}
		</div>
	);
}
function NumberField({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
}) {
	const id = useId();
	return (
		<div className="min-w-0 space-y-1 border border-border bg-background p-3 focus-within:border-primary">
			<label
				htmlFor={id}
				className="block text-[10px] uppercase tracking-wider text-muted-foreground"
			>
				{label}
			</label>
			<Input
				id={id}
				type="number"
				value={Number.isFinite(value) ? value : ""}
				onChange={(e) =>
					onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))
				}
				min={min}
				max={max}
				step={step}
				className="h-8 border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
			/>
		</div>
	);
}
function Toggle({
	checked,
	onChange,
	children,
	disabled,
}: {
	checked: boolean;
	onChange: (value: boolean) => void;
	children: ReactNode;
	disabled?: boolean;
}) {
	return (
		<label
			className={cn(
				"flex items-center gap-2.5 text-sm",
				disabled ? "cursor-default text-muted-foreground" : "cursor-pointer",
			)}
		>
			<input
				type="checkbox"
				className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				disabled={disabled}
			/>
			{children}
		</label>
	);
}
function AppIcon({ destination }: { destination: Destination }) {
	return (
		<Image
			src={
				destination === "video"
					? DEFAULT_LOGO_URL
					: `/export-icons/${destination}.png`
			}
			width={80}
			height={80}
			alt=""
			className={cn(
				"size-10 shrink-0 object-contain",
				destination === "video"
					? "border border-border bg-background"
					: "grayscale",
			)}
		/>
	);
}

export function ExportButton() {
	const project = useEditor((e) => e.project.getActiveOrNull());
	const [open, setOpen] = useState(false);
	const cancel = useRef<(() => void) | null>(null);
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && cancel.current) {
					cancel.current();
					return;
				}
				setOpen(next);
			}}
		>
			<DialogTrigger asChild>
				<Button
					disabled={!project}
					size="sm"
					className="h-9 gap-1.5 px-4 uppercase tracking-wider text-[11px]"
				>
					<ArrowUpRight className="size-3.5" />
					Export
				</Button>
			</DialogTrigger>
			{open && project && <ExportWorkspace cancelRef={cancel} />}
		</Dialog>
	);
}

function ExportWorkspace({
	cancelRef,
}: {
	cancelRef: React.RefObject<(() => void) | null>;
}) {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActive());
	const scene = useEditor((e) => e.scenes.getActiveScene());
	const media = useEditor((e) => e.media.getAssets());
	const duration = useEditor((e) => e.timeline.getTotalDuration());
	const exportState = useEditor((e) => e.project.getExportState());
	const [destination, setDestination] = useState<Destination>("video");
	const [options, setOptions] = useState<ExportOptions>({
		format: "mp4",
		quality: "high",
		includeAudio: true,
	});
	const [filename, setFilename] = useState(project.metadata.name);
	const [mode, setMode] = useState<HandoffMode>("appearance");
	const [includeSources, setIncludeSources] = useState(true);
	const [openApp, setOpenApp] = useState(canOpenHandoff);
	const [busy, setBusy] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [status, setStatus] = useState({ progress: 0, message: "" });
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [customRange, setCustomRange] = useState(false);
	const controller = useRef<AbortController | null>(null);
	const clearFeedback = () => {
		setError(null);
		setSuccess(null);
	};
	const patch = (next: Partial<ExportOptions>) => {
		setOptions((previous) => ({ ...previous, ...next }));
		clearFeedback();
	};
	const resolved = useMemo(() => {
		try {
			return {
				settings: resolveSettings({
					options,
					projectSettings: project.settings,
					duration,
				}),
				error: null,
			};
		} catch (e) {
			return {
				settings: null,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	}, [options, project.settings, duration]);
	const handoff = useMemo(() => {
		if (destination === "video") return { plan: null, error: null };
		try {
			return {
				plan: planHandoff({ project, scene, media, target: destination, mode }),
				error: null,
			};
		} catch (e) {
			return { plan: null, error: e instanceof Error ? e.message : String(e) };
		}
	}, [project, scene, media, destination, mode]);
	const settings = resolved.settings;
	const destinationLabel = destinations.find(
		(d) => d.id === destination,
	)?.label;
	const codec = options.codec ?? (options.format === "mp4" ? "avc" : "vp9");
	const effectiveFps = options.fps ?? project.settings.fps;
	const width = options.width ?? project.settings.canvasSize.width;
	const height = options.height ?? project.settings.canvasSize.height;
	const matchesTimelineSize =
		options.width === undefined && options.height === undefined;
	const outputFilename = `${safeExportFileName(filename)}.${options.format}`;
	const validation = destination === "video" ? resolved.error : handoff.error;
	const progress = exportState.isExporting
		? exportState.progress * (destination === "video" ? 1 : 0.65)
		: status.progress;
	const displayedProgress = Math.min(
		1,
		Math.max(0, Number.isFinite(progress) ? progress : 0),
	);
	const runExport = async () => {
		if (busy || controller.current || validation || duration <= 0) return;
		setBusy(true);
		setCancelling(false);
		clearFeedback();
		const abort = new AbortController();
		controller.current = abort;
		cancelRef.current = () => {
			if (abort.signal.aborted) return;
			abort.abort();
			editor.project.cancelExport();
			setCancelling(true);
			setStatus((s) => ({ ...s, message: "Cancelling…" }));
		};
		try {
			if (destination === "video") {
				setStatus({ progress: 0, message: "Rendering your video…" });
				const result = await editor.project.export({ options });
				abort.signal.throwIfAborted();
				if (!result.success || !result.buffer)
					throw new Error(result.error ?? "Export did not produce a file.");
				downloadBuffer({
					buffer: result.buffer,
					filename: outputFilename,
					mimeType: getExportMimeType({ format: options.format }),
				});
				setSuccess(`Your video is ready: ${outputFilename}`);
			} else {
				if (!handoff.plan)
					throw new Error(handoff.error ?? "Cannot prepare this timeline.");
				setSuccess(
					await exportHandoff({
						editor,
						plan: handoff.plan,
						includeSources,
						openApp,
						signal: abort.signal,
						onProgress: setStatus,
					}),
				);
			}
		} catch (e) {
			if (!abort.signal.aborted)
				setError(e instanceof Error ? e.message : String(e));
		} finally {
			editor.project.clearExportState();
			setBusy(false);
			setCancelling(false);
			cancelRef.current = null;
			controller.current = null;
			setStatus({ progress: 0, message: "" });
		}
	};

	return (
		<DialogContent
			className="max-h-[90dvh] max-w-[920px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none p-0"
			onCloseAutoFocus={(event) => event.stopPropagation()}
		>
			<DialogHeader className="px-4 py-5 sm:px-6">
				<DialogTitle>Export your edit</DialogTitle>
				<DialogDescription className="truncate pr-5">
					{project.metadata.name}{" "}
					<span className="px-1.5 text-muted-foreground/50">/</span>{" "}
					{scene.name} · Current timeline
				</DialogDescription>
			</DialogHeader>
			<div className="flex min-h-0 flex-col overflow-hidden md:flex-row">
				<nav
					aria-label="Export destination"
					className="flex shrink-0 gap-1 overflow-x-auto border-b bg-background p-3 md:w-[245px] md:flex-col md:overflow-y-auto md:border-r md:border-b-0"
				>
					<p className="hidden px-3 pt-1 pb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:block">
						Destination
					</p>
					{destinations.map((d) => (
						<button
							key={d.id}
							type="button"
							aria-pressed={destination === d.id}
							disabled={busy}
							onClick={() => {
								setDestination(d.id);
								clearFeedback();
							}}
							className={cn(
								"relative flex shrink-0 items-center gap-3 border border-transparent px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60",
								destination === d.id
									? "border-primary bg-muted"
									: "hover:bg-accent",
							)}
						>
							{destination === d.id && (
								<span
									aria-hidden="true"
									className="absolute inset-y-3 left-0 w-0.5 bg-primary"
								/>
							)}
							<AppIcon destination={d.id} />
							<span>
								<span className="block whitespace-nowrap text-sm font-medium">
									{d.label}
								</span>
								<span className="mt-0.5 hidden text-[11px] leading-4 text-muted-foreground md:block">
									{d.detail}
								</span>
							</span>
						</button>
					))}
					<div className="mt-auto hidden px-3 pt-8 pb-2 text-xs leading-5 text-muted-foreground md:block">
						{destination === "video"
							? "A finished video, ready to share."
							: "Continue your edit in another app. Your source project stays in the package."}
					</div>
				</nav>
				<div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain md:max-h-[62dvh]">
					<fieldset
						disabled={busy}
						className="min-w-0 space-y-6 p-4 disabled:opacity-60 sm:p-6"
					>
						{destination === "video" ? (
							<>
								<div className="flex items-start justify-between gap-3">
									<div>
										<h3 className="text-sm font-semibold">Video settings</h3>
										<p className="mt-1 text-xs text-muted-foreground">
											Fine-tune the file you deliver.
										</p>
									</div>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											setOptions({
												format: "mp4",
												quality: "high",
												includeAudio: true,
											});
											setCustomRange(false);
											clearFeedback();
										}}
									>
										<RotateCcw className="size-3.5" />
										Reset
									</Button>
								</div>
								<div className="min-w-0 space-y-1 border border-border bg-background p-3 focus-within:border-primary">
									<label
										htmlFor="export-filename"
										className="block text-[10px] uppercase tracking-wider text-muted-foreground"
									>
										File name
									</label>
									<div className="flex items-center gap-2">
										<Input
											id="export-filename"
											containerClassName="min-w-0 flex-1"
											className="h-8 border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0"
											aria-describedby="export-filename-hint"
											value={filename}
											onChange={(e) => {
												setFilename(e.target.value);
												clearFeedback();
											}}
										/>
										<span className="font-mono text-xs text-muted-foreground">
											.{options.format}
										</span>
									</div>
									<p
										id="export-filename-hint"
										className="break-words text-[11px] leading-4 text-muted-foreground"
									>
										Saves as {outputFilename}
									</p>
								</div>
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									<SelectField
										label="Container"
										value={options.format}
										onChange={(format) =>
											patch({
												format: format as "mp4" | "webm",
												codec: format === "mp4" ? "avc" : "vp9",
											})
										}
									>
										<option value="mp4">MP4</option>
										<option value="webm">WebM</option>
									</SelectField>
									<SelectField
										label="Video codec"
										value={codec}
										onChange={(value) =>
											patch({ codec: value as ExportOptions["codec"] })
										}
									>
										{options.format === "mp4" ? (
											<>
												<option value="avc">H.264 / AVC</option>
												<option value="hevc">H.265 / HEVC</option>
											</>
										) : (
											<option value="vp9">VP9</option>
										)}
										<option value="av1">AV1</option>
									</SelectField>
								</div>
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									<SelectField
										label="Resolution"
										value={
											matchesTimelineSize ? "source" : `${width}x${height}`
										}
										onChange={(value) => {
											if (value === "source")
												patch({ width: undefined, height: undefined });
											else {
												const [w, h] = value.split("x").map(Number);
												patch({ width: w, height: h });
											}
										}}
									>
										<option value="source">Match timeline</option>
										{[
											["1280x720", "HD · 720p"],
											["1920x1080", "Full HD · 1080p"],
											["3840x2160", "4K UHD · 2160p"],
											["1080x1920", "Vertical · 9:16"],
											["1080x1080", "Square · 1:1"],
										].map(([value, label]) => (
											<option key={value} value={value}>
												{label}
											</option>
										))}
										{!matchesTimelineSize &&
											![
												"1280x720",
												"1920x1080",
												"3840x2160",
												"1080x1920",
												"1080x1080",
											].includes(`${width}x${height}`) && (
												<option value={`${width}x${height}`}>
													Custom dimensions
												</option>
											)}
									</SelectField>
									<SelectField
										label="Frame rate"
										value={
											options.fps
												? `${effectiveFps.numerator}/${effectiveFps.denominator}`
												: "source"
										}
										onChange={(value) => {
											const [numerator, denominator] = value
												.split("/")
												.map(Number);
											patch({
												fps:
													value === "source"
														? undefined
														: { numerator, denominator },
											});
										}}
									>
										<option value="source">
											Timeline ·{" "}
											{(
												project.settings.fps.numerator /
												project.settings.fps.denominator
											)
												.toFixed(3)
												.replace(/\.?0+$/, "")}{" "}
											fps
										</option>
										{fpsChoices.map((f) => (
											<option
												key={f.label}
												value={`${f.numerator}/${f.denominator}`}
											>
												{f.label} fps
											</option>
										))}
									</SelectField>
									<NumberField
										label="Width (px)"
										value={width}
										min={16}
										max={7680}
										step={2}
										onChange={(value) => patch({ width: value })}
									/>
									<NumberField
										label="Height (px)"
										value={height}
										min={16}
										max={7680}
										step={2}
										onChange={(value) => patch({ height: value })}
									/>
								</div>
								<SelectField
									label="Resize behavior"
									value={options.fit ?? "contain"}
									onChange={(value) =>
										patch({ fit: value as ExportOptions["fit"] })
									}
								>
									<option value="contain">Fit · letterbox</option>
									<option value="cover">Fill · crop</option>
									<option value="stretch">Stretch · full frame</option>
								</SelectField>
								<div className="space-y-4 border-t pt-5">
									<h4 className="text-xs font-semibold">Encoding</h4>
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<SelectField
											label="Quality"
											value={
												options.videoBitrate === undefined
													? options.quality
													: "custom"
											}
											onChange={(value) =>
												patch(
													value === "custom"
														? {
																videoBitrate:
																	settings?.videoBitrate ?? 12000000,
															}
														: {
																quality: value as ExportOptions["quality"],
																videoBitrate: undefined,
															},
												)
											}
										>
											<option value="low">Compact</option>
											<option value="medium">Balanced</option>
											<option value="high">High quality</option>
											<option value="very_high">Maximum quality</option>
											<option value="custom">Custom bitrate</option>
										</SelectField>
										<NumberField
											label="Target bitrate (Mbps)"
											value={
												(options.videoBitrate ??
													settings?.videoBitrate ??
													12000000) / 1e6
											}
											min={0.1}
											max={500}
											step={0.1}
											onChange={(value) =>
												patch({ videoBitrate: Math.round(value * 1e6) })
											}
										/>
										<SelectField
											label="Bitrate mode"
											value={options.bitrateMode ?? "variable"}
											onChange={(value) =>
												patch({
													bitrateMode: value as ExportOptions["bitrateMode"],
												})
											}
										>
											<option value="variable">Variable</option>
											<option value="constant">Constant</option>
										</SelectField>
										<NumberField
											label="Keyframe interval (seconds)"
											value={options.keyFrameInterval ?? 2}
											min={0.1}
											max={30}
											step={0.1}
											onChange={(value) => patch({ keyFrameInterval: value })}
										/>
									</div>
									<SelectField
										label="Encoder preference"
										value={options.hardwareAcceleration ?? "no-preference"}
										onChange={(value) =>
											patch({
												hardwareAcceleration:
													value as ExportOptions["hardwareAcceleration"],
											})
										}
										hint="Codec and hardware support depend on your device. Unavailable settings are reported before encoding."
									>
										<option value="no-preference">Automatic</option>
										<option value="prefer-hardware">Prefer hardware</option>
										<option value="prefer-software">Prefer software</option>
									</SelectField>
								</div>
								<div className="space-y-4 border-t pt-5">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<h4 className="flex items-center gap-2 text-xs font-semibold">
											<Volume2 className="size-3.5" />
											Audio
										</h4>
										<Toggle
											checked={options.includeAudio ?? true}
											onChange={(value) => patch({ includeAudio: value })}
										>
											Include audio
										</Toggle>
									</div>
									{(options.includeAudio ?? true) && (
										<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
											<SelectField
												label={`Audio bitrate · ${options.format === "mp4" ? "AAC" : "Opus"}`}
												value={String(options.audioBitrate ?? 192000)}
												onChange={(value) =>
													patch({ audioBitrate: Number(value) })
												}
											>
												{[64, 96, 128, 192, 256, 320].map((kb) => (
													<option key={kb} value={kb * 1000}>
														{kb} kbps
													</option>
												))}
											</SelectField>
											<SelectField
												label="Sample rate"
												value={String(options.audioSampleRate ?? 48000)}
												onChange={(value) =>
													patch({ audioSampleRate: Number(value) })
												}
											>
												<option value="48000">48 kHz</option>
												<option value="44100">44.1 kHz</option>
											</SelectField>
											<SelectField
												label="Channels"
												value={String(options.audioChannels ?? 2)}
												onChange={(value) =>
													patch({ audioChannels: Number(value) })
												}
											>
												<option value="2">Stereo</option>
												<option value="1">Mono</option>
											</SelectField>
										</div>
									)}
								</div>
								<div className="space-y-4 border-t pt-5">
									<SelectField
										label="Export range"
										value={customRange ? "custom" : "all"}
										onChange={(value) => {
											setCustomRange(value === "custom");
											patch(
												value === "custom"
													? { rangeStart: 0, rangeEnd: duration }
													: { rangeStart: undefined, rangeEnd: undefined },
											);
										}}
									>
										<option value="all">Entire current timeline</option>
										<option value="custom">Custom in / out</option>
									</SelectField>
									{customRange && (
										<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
											<NumberField
												label="In (seconds)"
												value={(options.rangeStart ?? 0) / TICKS_PER_SECOND}
												min={0}
												max={duration / TICKS_PER_SECOND}
												step={0.001}
												onChange={(value) =>
													patch({
														rangeStart: Math.round(value * TICKS_PER_SECOND),
													})
												}
											/>
											<NumberField
												label="Out (seconds)"
												value={
													(options.rangeEnd ?? duration) / TICKS_PER_SECOND
												}
												min={0}
												max={duration / TICKS_PER_SECOND}
												step={0.001}
												onChange={(value) =>
													patch({
														rangeEnd: Math.round(value * TICKS_PER_SECOND),
													})
												}
											/>
										</div>
									)}
									<p className="text-[11px] text-muted-foreground">
										SDR · opaque video · project grades and the final audio mix
										are rendered into the file.
									</p>
								</div>
							</>
						) : (
							<>
								<div className="flex items-center gap-3">
									<AppIcon destination={destination} />
									<div>
										<h3 className="text-sm font-semibold">
											Continue in {destinationLabel}
										</h3>
										<p className="mt-1 text-xs text-muted-foreground">
											Bring your timeline and media with you.
										</p>
									</div>
								</div>
								<div
									className="space-y-2"
									role="radiogroup"
									aria-label="Timeline transfer mode"
								>
									{(
										[
											{
												id: "appearance",
												title: "Preserve appearance",
												detail:
													"Render the finished look and split it at edit boundaries. Grades, effects, titles and the audio mix are baked into the video.",
											},
											{
												id: "editable",
												title: "Keep clips editable",
												detail:
													"Transfer source clips, cuts, trims, tracks and basic settings. App-specific effects may need rebuilding.",
											},
										] as const
									).map((item) => (
										<label
											key={item.id}
											className={cn(
												"flex cursor-pointer items-start gap-3 border p-4 focus-within:border-primary",
												mode === item.id
													? "border-primary bg-background"
													: "border-border",
											)}
										>
											<input
												type="radio"
												name="handoff-mode"
												value={item.id}
												checked={mode === item.id}
												onChange={() => {
													setMode(item.id);
													clearFeedback();
												}}
												className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
											/>
											<span>
												<span className="block text-sm font-medium">
													{item.title}
												</span>
												<span className="mt-1 block text-xs leading-5 text-muted-foreground">
													{item.detail}
												</span>
											</span>
										</label>
									))}
								</div>
								<div className="border bg-background p-4">
									<h4 className="mb-3 flex items-center gap-2 text-xs font-semibold">
										<FolderOutput className="size-4" />
										Inside your handoff
									</h4>
									<ul className="space-y-2 text-xs text-muted-foreground">
										<li>
											Timeline with{" "}
											{(
												project.settings.fps.numerator /
												project.settings.fps.denominator
											)
												.toFixed(3)
												.replace(/\.?0+$/, "")}{" "}
											fps and {project.settings.canvasSize.width} ×{" "}
											{project.settings.canvasSize.height} canvas
										</li>
										<li>
											{destination === "after-effects"
												? "After Effects composition builder (.jsx)"
												: destination === "capcut"
													? "CapCut draft builder (.py)"
													: "Final Cut Pro 7 XML timeline (.xml)"}
										</li>
										<li>Original project settings and import instructions</li>
										{mode === "editable" && (
											<li>Text as timed subtitles (.srt)</li>
										)}
									</ul>
								</div>
								<Toggle
									checked={includeSources || mode === "editable"}
									disabled={mode === "editable"}
									onChange={(value) => {
										setIncludeSources(value);
										clearFeedback();
									}}
								>
									Include original source media
								</Toggle>
								{canOpenHandoff() && (
									<Toggle
										checked={openApp}
										onChange={(value) => {
											setOpenApp(value);
											clearFeedback();
										}}
									>
										Save a folder and open {destinationLabel}
									</Toggle>
								)}
								<p className="text-xs leading-5 text-muted-foreground">
									{canOpenHandoff() && openApp
										? "The handoff is saved in Downloads / Editor Exports. Import instructions are included for apps that require an import step."
										: "Download a ZIP with everything needed for the transfer. Extract it, then follow the included import instructions."}
								</p>
								{handoff.plan && (
									<div className="space-y-2 border-t pt-4">
										<h4 className="text-xs font-semibold">Transfer notes</h4>
										{handoff.plan.warnings.length ? (
											<ul className="space-y-2 text-xs leading-5 text-muted-foreground">
												{handoff.plan.warnings.map((warning) => (
													<li key={warning} className="flex gap-2">
														<span className="mt-2 size-1 shrink-0 bg-primary" />
														{warning}
													</li>
												))}
											</ul>
										) : (
											<p className="text-xs text-muted-foreground">
												This timeline uses the basic features supported by the
												handoff. Check the imported edit before delivery.
											</p>
										)}
									</div>
								)}
							</>
						)}
					</fieldset>
				</div>
			</div>
			<div className="space-y-3 border-t bg-background px-4 py-4 sm:px-6">
				{(error || validation) && (
					<p
						role="alert"
						className="max-h-24 overflow-y-auto break-words border border-destructive bg-background px-3 py-2 text-xs leading-5 text-destructive"
					>
						{error || validation}
					</p>
				)}
				{success && (
					<p
						role="status"
						className="flex max-h-24 items-start gap-2 overflow-y-auto break-words border border-primary bg-background px-3 py-2 text-xs leading-5"
					>
						<Check className="mt-0.5 size-4 shrink-0 text-primary" />
						{success}
					</p>
				)}
				{busy ? (
					<>
						<div
							className="flex items-center justify-between text-xs"
							aria-live="polite"
						>
							<span className="flex items-center gap-2">
								<Loader2 className="size-3.5 animate-spin" />
								{status.message}
							</span>
							<span className="font-mono">
								{Math.round(displayedProgress * 100)}%
							</span>
						</div>
						<Progress
							value={displayedProgress * 100}
							aria-label="Export progress"
							className="rounded-none"
						/>
						<div className="flex justify-end">
							<Button
								variant="outline"
								disabled={cancelling}
								onClick={() => cancelRef.current?.()}
							>
								<X className="size-4" />
								{cancelling ? "Cancelling…" : "Cancel export"}
							</Button>
						</div>
					</>
				) : (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="text-xs text-muted-foreground">
							{destination === "video" && settings ? (
								<>
									<span className="font-mono text-foreground">
										{settings.width} × {settings.height}
									</span>
									<span className="px-2">·</span>
									{(settings.endTicks - settings.startTicks) /
										TICKS_PER_SECOND <
									60
										? `${((settings.endTicks - settings.startTicks) / TICKS_PER_SECOND).toFixed(1)} sec`
										: `${((settings.endTicks - settings.startTicks) / TICKS_PER_SECOND / 60).toFixed(1)} min`}
									<span className="px-2">·</span>~
									{(settings.estimatedBytes / 1e6).toFixed(1)} MB
								</>
							) : destination === "video" ? (
								<>Configure a video export</>
							) : (
								<>
									{mode === "appearance"
										? "Rendered appearance"
										: "Editable timeline"}
									<span className="px-2">·</span>
									{openApp && canOpenHandoff() ? "Folder + app" : "ZIP package"}
								</>
							)}
						</div>
						<Button
							disabled={!!validation || duration <= 0}
							onClick={runExport}
							className="w-full bg-primary px-5 text-primary-foreground hover:bg-primary/90 sm:w-auto"
						>
							{destination === "video" ? <Download /> : <ArrowUpRight />}
							{destination === "video"
								? "Export video"
								: openApp && canOpenHandoff()
									? `Open in ${destinationLabel}`
									: `Export to ${destinationLabel}`}
						</Button>
					</div>
				)}
			</div>
		</DialogContent>
	);
}
