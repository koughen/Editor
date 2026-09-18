"use client";

import {
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type CSSProperties,
} from "react";
import {
	AudioLines,
	Film,
	Headphones,
	Music2,
	Pause,
	Play,
	RotateCcw,
	SkipBack,
	SlidersHorizontal,
	Volume2,
} from "lucide-react";
import { useEditor } from "@/editor/use-editor";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { Timeline } from "@/timeline/components";
import { AudioTab } from "@/timeline/components/audio-tab";
import { TracksSnapshotCommand } from "@/commands/timeline/tracks-snapshot";
import {
	updateTrackInSceneTracks,
	type SceneTracks,
	type AudioTrack,
	type VideoTrack,
} from "@/timeline";
import { TICKS_PER_SECOND, ZERO_MEDIA_TIME } from "@/wasm";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { getAudioTracks, getMixPreset, resolveMix } from "../settings";
import type { AudioMixSettings } from "../types";
import { AudioControl, AudioNumber } from "./audio-control";
import { ChannelMeter } from "./channel-meter";
import { Equalizer } from "./equalizer";
import "./audio-workspace.css";
import {
	AdvancedEffects,
	TrackAutomation,
	ChannelRouting,
} from "./advanced-controls";
import { AudioDelivery, LoudnessMeter } from "./audio-delivery";
import { ClipFadeCurves, CrossfadeSelection } from "./clip-fades";

const CHANNEL_COLORS = ["#d4d4d4", "#a3a3a3", "#bdbdbd", "#8c8c8c", "#e5e5e5"];

export function AudioWorkspace({ children }: { children: ReactNode }) {
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const selection = useEditor((e) => e.selection.getSelectedElements());
	const [selectedId, setSelectedId] = useState(
		selection[0]?.trackId ?? scene?.tracks.main.id ?? "master",
	);
	const before = useRef<SceneTracks | null>(null);
	const [panel, setPanel] = useState("effects");
	const commit = () => {
		const after = editor.scenes.getActiveSceneOrNull()?.tracks;
		if (before.current && after && before.current !== after)
			editor.command.push({
				command: new TracksSnapshotCommand(before.current, after),
			});
		before.current = null;
	};
	const commitRef = useRef(commit);
	commitRef.current = commit;
	useEffect(() => () => commitRef.current(), []);
	useEffect(() => {
		if (selection[0]) setSelectedId(selection[0].trackId);
	}, [selection]);
	if (!scene) return null;
	const channels = getAudioTracks({ tracks: scene.tracks });
	const selectedTrack = channels.find((t) => t.id === selectedId);
	const selectedBus = scene.tracks.audioBuses?.find((b) => b.id === selectedId);
	const channelId = selectedTrack?.id ?? selectedBus?.id ?? "master";
	const settings = resolveMix({
		settings: selectedTrack
			? selectedTrack.audioMix
			: selectedBus
				? selectedBus.audioMix
				: scene.tracks.audioMaster,
	});
	const edit = ({
		id,
		patch,
		mix,
	}: {
		id: string;
		patch?: Partial<AudioTrack | VideoTrack>;
		mix?: Partial<AudioMixSettings>;
	}) => {
		const tracks = editor.scenes.getActiveScene().tracks;
		if (!before.current) before.current = tracks;
		const next =
			id === "master"
				? {
						...tracks,
						audioMaster: resolveMix({
							settings: { ...tracks.audioMaster, ...mix },
						}),
					}
				: tracks.audioBuses?.some((b) => b.id === id)
					? {
							...tracks,
							audioBuses: tracks.audioBuses.map((b) =>
								b.id === id
									? {
											...b,
											...patch,
											audioMix: resolveMix({
												settings: { ...b.audioMix, ...mix },
											}),
										}
									: b,
							),
						}
					: updateTrackInSceneTracks({
							tracks,
							trackId: id,
							update: (t) => ({
								...t,
								...patch,
								...(mix
									? {
											audioMix: resolveMix({
												settings: {
													...("audioMix" in t ? t.audioMix : {}),
													...mix,
												},
											}),
										}
									: {}),
							}),
						});
		editor.timeline.updateTracks(next);
	};
	const busEdit = (
		id: string,
		action: "group" | "return" | "delete" | "rename",
		name?: string,
	) => {
		commit();
		const tracks = editor.scenes.getActiveScene().tracks;
		before.current = tracks;
		if (action === "delete") {
			editor.timeline.updateTracks({
				...tracks,
				audioBuses: tracks.audioBuses?.filter((b) => b.id !== id),
			});
			setSelectedId("master");
		} else if (action === "rename")
			editor.timeline.updateTracks({
				...tracks,
				audioBuses: tracks.audioBuses?.map((b) =>
					b.id === id ? { ...b, name: name ?? b.name } : b,
				),
			});
		else {
			const bus = {
				id: crypto.randomUUID(),
				name:
					action === "group"
						? `Group ${(tracks.audioBuses?.filter((b) => b.kind === "group").length ?? 0) + 1}`
						: `Reverb return ${(tracks.audioBuses?.filter((b) => b.kind === "return").length ?? 0) + 1}`,
				kind: action,
				muted: false,
				solo: false,
				audioMix: resolveMix({
					settings: action === "return" ? { reverbMix: 1, wetOnly: true } : {},
				}),
			};
			editor.timeline.updateTracks({
				...tracks,
				audioBuses: [...(tracks.audioBuses ?? []), bus],
			});
			setSelectedId(bus.id);
			setPanel("routing");
		}
		commit();
	};
	const change = (mix: Partial<AudioMixSettings>) =>
		edit({ id: channelId, mix });
	const selectedClip = selectedTrack?.elements.find(
		(e) =>
			e.id === selection[0]?.elementId &&
			(e.type === "audio" || e.type === "video"),
	);
	const clip =
		selectedClip &&
		(selectedClip.type === "audio" || selectedClip.type === "video")
			? selectedClip
			: null;
	const clipCount = channels.reduce(
		(total, track) =>
			total +
			track.elements.filter((e) => e.type === "audio" || e.type === "video")
				.length,
		0,
	);
	return (
		<div className="audio-workspace">
			<div className="audio-toolbar">
				<div className="audio-workspace-title">
					<AudioLines size={17} />
					<strong>Audio</strong>
					<span>Mixing desk</span>
				</div>
				<AudioTransport />
				<ReferencePreview />
				<div className="audio-toolbar-actions">
					<CrossfadeSelection />
					<button type="button" onClick={() => setPanel("export")}>
						Export audio
					</button>
				</div>
				<button
					type="button"
					onClick={() => useAssetsPanelStore.getState().setActiveTab("media")}
				>
					<Music2 size={14} /> Add media
				</button>
			</div>
			<ResizablePanelGroup direction="vertical">
				<ResizablePanel defaultSize={76} minSize={35} className="min-h-0">
					<div className="audio-desk">
						<aside className="audio-monitor-column">
							<div className="audio-video-monitor">{children}</div>
							<div className="audio-clip-editor">
								<div className="audio-panel-heading">
									<strong>Clip inspector</strong>
									<span>{clip ? "Selected clip" : "No selection"}</span>
								</div>
								{clip && selectedTrack ? (
									<div key={clip.id}>
										<h3 title={clip.name}>{clip.name}</h3>
										<AudioTab element={clip} trackId={selectedTrack.id} />
										<ClipFadeCurves element={clip} trackId={selectedTrack.id} />
										<div className="audio-clip-fades">
											{(["fadeIn", "fadeOut"] as const).map((field) => (
												<ClipFade
													key={`${clip.id}:${field}`}
													label={field === "fadeIn" ? "Fade in" : "Fade out"}
													value={clip[field] ?? 0}
													max={clip.duration / TICKS_PER_SECOND}
													onCommit={(value) =>
														editor.timeline.updateElements({
															updates: [
																{
																	trackId: selectedTrack.id,
																	elementId: clip.id,
																	patch: { [field]: value },
																},
															],
														})
													}
												/>
											))}
										</div>
									</div>
								) : (
									<div className="audio-empty-inspector">
										<AudioLines size={25} />
										<p>
											Select a clip in the timeline to edit its volume
											automation and fades.
										</p>
									</div>
								)}
							</div>
						</aside>
						<section className="audio-mixer">
							<div className="audio-panel-heading">
								<strong>
									<SlidersHorizontal size={13} /> Mixer
								</strong>
								<div className="audio-bus-actions">
									<button type="button" onClick={() => busEdit("", "group")}>
										+ Group
									</button>
									<button type="button" onClick={() => busEdit("", "return")}>
										+ Return
									</button>
								</div>
							</div>
							<div className="audio-channel-scroll">
								{channels.map((track, index) => (
									<ChannelStrip
										key={track.id}
										id={track.id}
										name={track.name}
										kind={track.type}
										index={index + 1}
										color={CHANNEL_COLORS[index % CHANNEL_COLORS.length]}
										settings={resolveMix({ settings: track.audioMix })}
										selected={channelId === track.id}
										muted={track.muted}
										solo={track.solo ?? false}
										onSelect={() => {
											commit();
											setSelectedId(track.id);
										}}
										onChange={(mix) => edit({ id: track.id, mix })}
										onCommit={commit}
										onToggle={(field) => {
											edit({ id: track.id, patch: { [field]: !track[field] } });
											commit();
										}}
									/>
								))}
								{scene.tracks.audioBuses?.map((bus, index) => (
									<ChannelStrip
										key={bus.id}
										id={bus.id}
										name={bus.name}
										kind={bus.kind}
										index={channels.length + index + 1}
										color="#bdbdbd"
										settings={resolveMix({ settings: bus.audioMix })}
										selected={channelId === bus.id}
										muted={bus.muted}
										solo={bus.solo}
										onSelect={() => {
											commit();
											setSelectedId(bus.id);
										}}
										onChange={(mix) => edit({ id: bus.id, mix })}
										onCommit={commit}
										onToggle={(field) => {
											edit({ id: bus.id, patch: { [field]: !bus[field] } });
											commit();
										}}
									/>
								))}
								<ChannelStrip
									id="master"
									name="Stereo out"
									kind="master"
									index={0}
									color="var(--primary)"
									settings={resolveMix({ settings: scene.tracks.audioMaster })}
									selected={channelId === "master"}
									muted={false}
									solo={false}
									onSelect={() => {
										commit();
										setSelectedId("master");
									}}
									onChange={(mix) => edit({ id: "master", mix })}
									onCommit={commit}
								/>
							</div>
							{clipCount === 0 && (
								<div className="audio-empty-mixer">
									<Headphones size={26} />
									<h3>Your mix starts here</h3>
									<p>
										Add audio or video to the timeline. Each track has its own
										mixer channel.
									</p>
									<button
										type="button"
										onClick={() =>
											useAssetsPanelStore.getState().setActiveTab("media")
										}
									>
										Open media library
									</button>
								</div>
							)}
							<LoudnessMeter />
							<div className="audio-mixer-footer">
								<span>
									<span className="audio-status-dot" /> Track FX → Groups /
									Returns → Stereo out
								</span>
								<span>Peak meters · dBFS</span>
							</div>
						</section>
						<aside className="audio-effects">
							<div className="audio-panel-heading">
								<strong
									title={
										selectedTrack?.name ?? selectedBus?.name ?? "Stereo out"
									}
								>
									{selectedTrack?.name ?? selectedBus?.name ?? "Stereo out"}
								</strong>
								<button
									type="button"
									title="Reset channel settings"
									aria-label="Reset channel settings"
									onClick={() => {
										change(getMixPreset({ name: "default" }));
										commit();
									}}
								>
									<RotateCcw size={13} />
								</button>
							</div>
							<div
								className="audio-inspector-tabs"
								role="tablist"
								aria-label="Audio inspector"
							>
								{["effects", "automation", "routing", "export"].map((tab) => (
									<button
										key={tab}
										type="button"
										role="tab"
										aria-selected={panel === tab}
										onClick={() => {
											commit();
											setPanel(tab);
										}}
									>
										{tab}
									</button>
								))}
							</div>
							<div
								className="audio-effects-scroll"
								key={`${channelId}:${panel}`}
							>
								{panel === "automation" && (
									<TrackAutomation
										settings={settings}
										onChange={change}
										onCommit={commit}
									/>
								)}
								{panel === "routing" && (
									<ChannelRouting
										settings={settings}
										onChange={change}
										onCommit={commit}
										tracks={scene.tracks}
										channelId={channelId}
										onRename={
											selectedBus
												? (name) => busEdit(channelId, "rename", name)
												: undefined
										}
										onDelete={
											selectedBus
												? () => busEdit(channelId, "delete")
												: undefined
										}
									/>
								)}
								{panel === "export" && <AudioDelivery />}
								{panel === "effects" && (
									<>
										<AdvancedEffects
											settings={settings}
											onChange={change}
											onCommit={commit}
											tracks={scene.tracks}
											channelId={channelId}
										/>

										<div className="audio-preset-row">
											<label htmlFor="audio-preset">Channel preset</label>
											<select
												id="audio-preset"
												value=""
												onChange={(e) => {
													const preset = getMixPreset({ name: e.target.value });
													change({
														...preset,
														gainDb: settings.gainDb,
														pan: settings.pan,
														automation: settings.automation,
														automationEnabled: settings.automationEnabled,
														outputId: settings.outputId,
														sends: settings.sends,
														duckSource: settings.duckSource,
														plugins: settings.plugins,
														wetOnly: settings.wetOnly,
														cleanup: settings.cleanup,
													});
													commit();
												}}
											>
												<option value="" disabled>
													Choose preset…
												</option>
												<option value="default">Flat / clean</option>
												<option value="voice">Dialogue clarity</option>
												<option value="warm">Warm music</option>
												<option value="punch">Drum punch</option>
												<option value="space">Ambient space</option>
											</select>
										</div>
										<label className="audio-toggle">
											<input
												type="checkbox"
												checked={settings.bypass}
												onChange={(e) => {
													change({ bypass: e.target.checked });
													commit();
												}}
											/>{" "}
											Bypass channel effects
										</label>
										<EffectSection
											title="Channel EQ"
											subtitle="4 bands + low cut"
											enabled={settings.eqEnabled}
											onToggle={() => {
												change({ eqEnabled: !settings.eqEnabled });
												commit();
											}}
										>
											<Equalizer settings={settings} />
											{renderControls({
												fields: EQ_FIELDS,
												settings,
												onChange: change,
												onCommit: commit,
												disabled: settings.bypass || !settings.eqEnabled,
											})}
										</EffectSection>
										<EffectSection
											title="Compressor"
											subtitle="Dynamics"
											enabled={settings.compressorEnabled}
											onToggle={() => {
												change({
													compressorEnabled: !settings.compressorEnabled,
												});
												commit();
											}}
										>
											{renderControls({
												fields: COMP_FIELDS,
												settings,
												onChange: change,
												onCommit: commit,
												disabled:
													settings.bypass || !settings.compressorEnabled,
											})}
										</EffectSection>
										<EffectSection title="Reverb" subtitle="Stereo room">
											<p className="audio-effect-hint">
												Add space around the dry signal.
											</p>
											{renderControls({
												fields: REVERB_FIELDS,
												settings,
												onChange: change,
												onCommit: commit,
												disabled: settings.bypass,
											})}
										</EffectSection>
										<EffectSection title="Delay" subtitle="Stereo echo">
											{renderControls({
												fields: DELAY_FIELDS,
												settings,
												onChange: change,
												onCommit: commit,
												disabled: settings.bypass,
											})}
										</EffectSection>
									</>
								)}
							</div>
						</aside>
					</div>
				</ResizablePanel>
				<ResizableHandle withHandle className="audio-resize-handle" />
				<ResizablePanel defaultSize={24} minSize={18} className="min-h-0">
					<div className="audio-timeline">
						<Timeline />
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}

function ChannelStrip({
	id,
	name,
	kind,
	index,
	color,
	settings,
	selected,
	muted,
	solo,
	onSelect,
	onChange,
	onCommit,
	onToggle,
}: {
	id: string;
	name: string;
	kind: string;
	index: number;
	color: string;
	settings: AudioMixSettings;
	selected: boolean;
	muted: boolean;
	solo: boolean;
	onSelect: () => void;
	onChange: (mix: Partial<AudioMixSettings>) => void;
	onCommit: () => void;
	onToggle?: (field: "muted" | "solo") => void;
}) {
	return (
		<div
			className={`audio-channel ${kind === "master" ? "audio-master" : ""}`}
			data-selected={selected}
			style={{ "--channel-color": color } as CSSProperties}
		>
			<button
				type="button"
				className="audio-channel-name"
				onClick={onSelect}
				aria-pressed={selected}
				title={name}
			>
				<span>
					{kind === "master" ? (
						<Volume2 size={15} />
					) : kind === "video" ? (
						<Film size={15} />
					) : (
						<Music2 size={15} />
					)}
					<small>
						{kind === "master" ? "MASTER" : String(index).padStart(2, "0")}
					</small>
				</span>
				<strong>{name}</strong>
			</button>
			<div className="audio-insert-summary">
				<button
					type="button"
					onClick={onSelect}
					data-active={settings.eqEnabled && !settings.bypass}
				>
					Channel EQ
				</button>
				<button
					type="button"
					onClick={onSelect}
					data-active={settings.compressorEnabled && !settings.bypass}
				>
					Compressor
				</button>
				<span>
					{settings.bypass
						? "FX bypassed"
						: settings.reverbMix > 0 || settings.delayMix > 0
							? "Space + echo"
							: "Dry signal"}
				</span>
			</div>
			<label className="audio-pan">
				<span>
					Pan{" "}
					<output>
						{settings.pan === 0
							? "C"
							: `${settings.pan < 0 ? "L" : "R"}${Math.round(Math.abs(settings.pan) * 100)}`}
					</output>
				</span>
				<input
					type="range"
					min={-1}
					max={1}
					step={0.01}
					value={settings.pan}
					aria-label={`${name} pan`}
					onChange={(e) => onChange({ pan: Number(e.target.value) })}
					onPointerUp={onCommit}
					onPointerCancel={onCommit}
					onKeyUp={onCommit}
					onBlur={onCommit}
					onDoubleClick={() => {
						onChange({ pan: 0 });
						onCommit();
					}}
				/>
			</label>
			<div className="audio-ms">
				{kind !== "master" ? (
					<>
						<button
							type="button"
							aria-label={`Mute ${name}`}
							aria-pressed={muted}
							data-active={muted}
							onClick={() => onToggle?.("muted")}
						>
							M
						</button>
						<button
							type="button"
							aria-label={`Solo ${name}`}
							aria-pressed={solo}
							data-active={solo}
							onClick={() => onToggle?.("solo")}
						>
							S
						</button>
					</>
				) : (
					<span>POST FX</span>
				)}
			</div>
			<div className="audio-fader-area">
				<div className="audio-fader-scale">
					<span>+12</span>
					<span>0</span>
					<span>−12</span>
					<span>−24</span>
					<span>−48</span>
					<span>−60</span>
				</div>
				<input
					className="audio-fader"
					type="range"
					min={-60}
					max={12}
					step={0.1}
					value={settings.gainDb}
					aria-label={`${name} volume`}
					aria-valuetext={`${settings.gainDb.toFixed(1)} decibels`}
					onChange={(e) => onChange({ gainDb: Number(e.target.value) })}
					onPointerUp={onCommit}
					onPointerCancel={onCommit}
					onKeyUp={onCommit}
					onBlur={onCommit}
					onDoubleClick={() => {
						onChange({ gainDb: 0 });
						onCommit();
					}}
				/>
				<ChannelMeter trackId={id} />
			</div>
			<div className="audio-fader-value">
				<AudioNumber
					label={`${name} volume value`}
					value={settings.gainDb}
					min={-60}
					max={12}
					step={0.1}
					onChange={(gainDb) => onChange({ gainDb })}
					onCommit={onCommit}
				/>
				<span>dB</span>
			</div>
			<div className="audio-channel-route">
				{kind === "master"
					? "LIMITER → OUTPUT"
					: kind === "return"
						? "FX RETURN → OUT"
						: settings.outputId === "master"
							? "→ STEREO OUT"
							: "→ GROUP BUS"}
			</div>
		</div>
	);
}

function AudioTransport() {
	const editor = useEditor();
	const playing = useEditor((e) => e.playback.getIsPlaying());
	const [ticks, setTicks] = useState(() => editor.playback.getCurrentTime());
	useEffect(() => {
		const update = editor.playback.onUpdate(setTicks);
		const seek = editor.playback.onSeek(setTicks);
		return () => {
			update();
			seek();
		};
	}, [editor]);
	const seconds = ticks / TICKS_PER_SECOND;
	const timecode = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
	return (
		<div className="audio-transport">
			<button
				type="button"
				aria-label="Return to start"
				onClick={() => editor.playback.seek({ time: ZERO_MEDIA_TIME })}
			>
				<SkipBack size={15} />
			</button>
			<button
				type="button"
				className="audio-play"
				aria-label={playing ? "Pause" : "Play"}
				onClick={() => editor.playback.toggle()}
			>
				{playing ? <Pause size={15} /> : <Play size={15} />}
			</button>
			<output>{timecode}</output>
		</div>
	);
}

function EffectSection({
	title,
	subtitle,
	children,
	enabled,
	onToggle,
}: {
	title: string;
	subtitle: string;
	children: ReactNode;
	enabled?: boolean;
	onToggle?: () => void;
}) {
	return (
		<section className="audio-effect-section">
			<div className="audio-effect-heading">
				<h3>{title}</h3>
				<span>{subtitle}</span>
				{onToggle && (
					<button
						type="button"
						aria-label={`Enable ${title}`}
						aria-pressed={enabled}
						data-active={enabled}
						onClick={onToggle}
					>
						{enabled ? "ON" : "OFF"}
					</button>
				)}
			</div>
			{children}
		</section>
	);
}

function ClipFade({
	value,
	max,
	label,
	onCommit,
}: {
	value: number;
	max: number;
	label: string;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	return (
		<AudioControl
			label={label}
			value={draft}
			min={0}
			max={max}
			step={0.01}
			unit="s"
			onChange={setDraft}
			onCommit={() => {
				if (draft !== value) onCommit(draft);
			}}
		/>
	);
}

type NumericKey = {
	[K in keyof AudioMixSettings]: AudioMixSettings[K] extends number ? K : never;
}[keyof AudioMixSettings];
type Field = [NumericKey, string, number, number, number, string];
const EQ_FIELDS: Field[] = [
	["highPass", "Low cut", 20, 1000, 1, "Hz"],
	["lowGain", "Low shelf · 120 Hz", -18, 18, 0.1, "dB"],
	["lowMidFreq", "Low-mid frequency", 80, 2000, 1, "Hz"],
	["lowMidGain", "Low-mid gain", -18, 18, 0.1, "dB"],
	["highMidFreq", "High-mid frequency", 500, 12000, 1, "Hz"],
	["highMidGain", "High-mid gain", -18, 18, 0.1, "dB"],
	["highGain", "High shelf · 8 kHz", -18, 18, 0.1, "dB"],
];
const COMP_FIELDS: Field[] = [
	["threshold", "Threshold", -60, 0, 0.5, "dB"],
	["ratio", "Ratio", 1, 20, 0.1, ":1"],
	["attack", "Attack", 0.1, 200, 0.1, "ms"],
	["release", "Release", 10, 1000, 1, "ms"],
	["makeup", "Makeup", 0, 18, 0.1, "dB"],
];
const REVERB_FIELDS: Field[] = [
	["reverbMix", "Send level", 0, 1, 0.01, ""],
	["reverbDecay", "Decay", 0.2, 5, 0.1, "s"],
];
const DELAY_FIELDS: Field[] = [
	["delayMix", "Send level", 0, 1, 0.01, ""],
	["delayTime", "Time", 10, 1000, 1, "ms"],
	["delayFeedback", "Feedback", 0, 0.85, 0.01, ""],
];
function renderControls({
	fields,
	settings,
	onChange,
	onCommit,
	disabled,
}: {
	fields: Field[];
	settings: AudioMixSettings;
	onChange: (mix: Partial<AudioMixSettings>) => void;
	onCommit: () => void;
	disabled: boolean;
}) {
	return fields.map(([key, label, min, max, step, unit]) => (
		<AudioControl
			key={key}
			label={label}
			value={settings[key]}
			min={min}
			max={max}
			step={step}
			unit={unit}
			disabled={disabled}
			onChange={(value) => onChange({ [key]: value })}
			onCommit={onCommit}
		/>
	));
}

function ReferencePreview() {
	const editor = useEditor();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	return (
		<div className="audio-reference-preview">
			<button
				type="button"
				disabled={busy}
				title="Render the whole mix with 3 seconds of tails. Seeking then preserves effect history."
				onClick={async () => {
					setBusy(true);
					setMessage("Rendering…");
					try {
						await editor.audio.preparePluginPreview();
						setMessage("Ready · exact seeks + 3s tails");
					} catch (e) {
						setMessage(e instanceof Error ? e.message : String(e));
					} finally {
						setBusy(false);
					}
				}}
			>
				{busy ? "Rendering…" : "Render exact preview"}
			</button>
			<button
				type="button"
				onClick={() => {
					editor.audio.setLivePreview();
					setMessage("Live mixer");
				}}
			>
				Live
			</button>
			{message && <small role="status">{message}</small>}
		</div>
	);
}
