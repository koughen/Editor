"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	Palette,
	RotateCcw,
	Eye,
	EyeOff,
	Film,
	Plus,
	Trash2,
	ChevronLeft,
	ChevronRight,
	Copy,
	ClipboardPaste,
	Image as ImageIcon,
	Layers,
	Camera,
	GripHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import type { VideoElement, ImageElement } from "@/timeline";
import type { Effect } from "@/effects/types";
import { buildDefaultEffectInstance } from "@/effects";
import {
	COLOR_DEFAULTS,
	COLOR_GRADE_TYPE,
} from "@/effects/definitions/color-grade";
import type { ParamValues } from "@/params";
import { generateUUID } from "@/utils/id";
import { wasmCompositor } from "@/services/renderer/compositor/wasm-compositor";
import { Timeline } from "@/timeline/components";
import { ColorKeyframes } from "./color-keyframes";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import {
	buildEffectParamPath,
	resolveEffectParamsAtTime,
	upsertPathKeyframe,
	hasKeyframesForPath,
	getElementKeyframes,
	removeElementKeyframe,
} from "@/animation";
import { ColorPalettes } from "./color-palettes";
import { ColorScopes } from "./color-scopes";
import { useColorMonitorStore, resetColorMonitor } from "../monitor-store";
import {
	listStills,
	saveStill,
	removeStill,
	type ColorStill,
} from "../library";
import "./color-workspace.css";

let copiedGrades: Effect[] = [];

export function ColorWorkspace({ children }: { children: ReactNode }) {
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const media = useEditor((e) => e.media.getAssets());
	const { selectedElements, selectElement } = useElementSelection();
	const clips = scene
		? [...scene.tracks.overlay, scene.tracks.main]
				.flatMap((track) =>
					track.elements.flatMap((element) =>
						element.type === "video" || element.type === "image"
							? [{ element, trackId: track.id }]
							: [],
					),
				)
				.sort((a, b) => a.element.startTime - b.element.startTime)
		: [];
	const selection =
		selectedElements.length === 1
			? clips.find(
					(c) =>
						c.element.id === selectedElements[0].elementId &&
						c.trackId === selectedElements[0].trackId,
				)
			: undefined;
	const strip = (
		<section className="grade-filmstrip" aria-label="Clips">
			{clips.map(({ element, trackId }, index) => {
				const asset = media.find((a) => a.id === element.mediaId);
				return (
					<button
						type="button"
						className="grade-clip"
						data-selected={selection?.element.id === element.id}
						key={element.id}
						aria-pressed={selection?.element.id === element.id}
						onClick={() => {
							editor.timeline.commitPreview();
							selectElement({ trackId, elementId: element.id });
							editor.playback.seek({ time: element.startTime });
						}}
					>
						<div
							className="grade-clip-thumbnail"
							style={
								asset?.thumbnailUrl
									? { backgroundImage: `url("${asset.thumbnailUrl}")` }
									: undefined
							}
						>
							{!asset?.thumbnailUrl && <Film size={20} />}
							<span>{String(index + 1).padStart(2, "0")}</span>
							{element.effects?.some(
								(e) => e.type === COLOR_GRADE_TYPE && e.enabled,
							) && <Palette size={12} className="grade-clip-badge" />}
						</div>
						<span className="grade-clip-name">{element.name}</span>
					</button>
				);
			})}
			{!clips.length && (
				<p className="grade-empty-copy">
					Add video or images in Edit to start grading.
				</p>
			)}
		</section>
	);
	if (!selection)
		return (
			<div className="color-workspace">
				<div className="grade-top">
					<div className="grade-viewer">{children}</div>
				</div>
				{strip}
				<div className="grade-no-selection">
					<Palette size={30} />
					<h2>Select one clip to grade</h2>
					<p>
						Choose a clip in the strip. Corrections and serial nodes stay with
						that clip.
					</p>
				</div>
			</div>
		);
	return (
		<GradeSession
			key={`${selection.trackId}:${selection.element.id}`}
			element={selection.element}
			trackId={selection.trackId}
			strip={strip}
		>
			{children}
		</GradeSession>
	);
}

function GradeSession({
	element,
	trackId,
	strip,
	children,
}: {
	element: VideoElement | ImageElement;
	trackId: string;
	strip: ReactNode;
	children: ReactNode;
}) {
	const editor = useEditor();
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [showNodes, setShowNodes] = useState(true);
	const [showGallery, setShowGallery] = useState(false);
	const [showTimeline, setShowTimeline] = useState(false);
	const [stills, setStills] = useState<ColorStill[]>([]);
	const [reference, setReference] = useState<ColorStill | null>(null);
	const [wipe, setWipe] = useState(50);
	const [compare, setCompare] = useState(false);
	const viewerRef = useRef<HTMLDivElement>(null);
	const [referenceBounds, setReferenceBounds] = useState({
		left: 0,
		top: 0,
		width: 0,
		height: 0,
	});
	useEffect(() => {
		if (!compare) return;
		const measure = () => {
			try {
				const viewer = viewerRef.current?.getBoundingClientRect();
				const canvas = wasmCompositor.getCanvas().getBoundingClientRect();
				if (!viewer || !canvas.width) return;
				const bounds = {
					left: canvas.left - viewer.left,
					top: canvas.top - viewer.top,
					width: canvas.width,
					height: canvas.height,
				};
				setReferenceBounds((previous) =>
					Object.entries(bounds).every(
						([key, value]) => previous[key as keyof typeof bounds] === value,
					)
						? previous
						: bounds,
				);
			} catch {
				/* Canvas can be replaced during a viewer resize. */
			}
		};
		measure();
		const timer = window.setInterval(measure, 100);
		return () => window.clearInterval(timer);
	}, [compare]);
	const [clipboardAvailable, setClipboardAvailable] = useState(
		copiedGrades.length > 0,
	);
	const neutral = useRef<Effect | null>(null);
	if (!neutral.current)
		neutral.current = buildDefaultEffectInstance({
			effectType: COLOR_GRADE_TYPE,
		});
	const effects = renderElement.effects ?? [];
	const grades = effects.filter((e) => e.type === COLOR_GRADE_TYPE);
	const nodes = grades.length ? grades : [neutral.current];
	const active = nodes.find((n) => n.id === selectedNode) ?? nodes[0];
	const monitor = useColorMonitorStore();
	useEffect(() => {
		useColorMonitorStore.setState({ elementId: element.id, nodeId: active.id });
	}, [element.id, active.id]);
	useEffect(() => resetColorMonitor, []);
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const params: ParamValues = resolveEffectParamsAtTime({
		effectId: active.id,
		params: { ...COLOR_DEFAULTS, ...active.params },
		animations: renderElement.animations,
		localTime,
	});
	const animationRef = useRef(renderElement.animations);
	animationRef.current = renderElement.animations;

	const latest = useRef(effects);
	latest.current = effects;
	const dirty = useRef(false);
	const preview = (next: Effect[]) => {
		latest.current = next;
		dirty.current = true;
		previewUpdates({ effects: next });
	};
	const finish = () => {
		if (dirty.current) {
			commit();
			dirty.current = false;
		}
	};
	useEffect(
		() => () => {
			if (dirty.current) editor.timeline.commitPreview();
		},
		[editor],
	);
	useEffect(() => {
		listStills()
			.then(setStills)
			.catch(() => toast.error("Could not open the color gallery"));
	}, []);
	const replaceNode = ({ node }: { node: Effect }) => {
		const existing = latest.current.some((e) => e.id === node.id);
		preview(
			existing
				? latest.current.map((e) => (e.id === node.id ? node : e))
				: [...latest.current, node],
		);
	};
	const patch = (values: ParamValues) => {
		const current = latest.current.find((e) => e.id === active.id) ?? active;
		const staticValues: ParamValues = {};
		let animations = animationRef.current;
		for (const [key, value] of Object.entries(values)) {
			const propertyPath = buildEffectParamPath({
				effectId: active.id,
				paramKey: key,
			});
			if (
				typeof value === "number" &&
				isPlayheadWithinElementRange &&
				hasKeyframesForPath({ animations, propertyPath })
			) {
				animations = upsertPathKeyframe({
					animations,
					propertyPath,
					time: localTime,
					value,
					kind: "number",
					defaultInterpolation: "linear",
					coerceValue: ({ value }) =>
						typeof value === "number" && Number.isFinite(value) ? value : null,
				});
			} else {
				staticValues[key] = value;
			}
		}
		replaceNode({
			node: {
				...current,
				enabled: true,
				params: { ...current.params, ...staticValues },
			},
		});
		if (animations !== animationRef.current) {
			animationRef.current = animations;
			previewUpdates({ animations });
		}
	};
	const clearAnimation = ({ ids = [active.id] }: { ids?: string[] } = {}) => {
		let animations = animationRef.current;
		for (const key of getElementKeyframes({ animations }).filter((k) =>
			ids.some((id) => k.propertyPath.startsWith(`effects.${id}.params.`)),
		)) {
			animations = removeElementKeyframe({
				animations,
				propertyPath: key.propertyPath,
				keyframeId: key.id,
			});
		}
		animationRef.current = animations;
		previewUpdates({ animations });
	};

	const add = () => {
		finish();
		const node = buildDefaultEffectInstance({ effectType: COLOR_GRADE_TYPE });
		node.params.nodeLabel = "Correction";
		let list = latest.current.some((e) => e.id === active.id)
			? latest.current
			: [...latest.current, active];
		const index = list.findIndex((e) => e.id === active.id);
		list = [...list.slice(0, index + 1), node, ...list.slice(index + 1)];
		preview(list);
		finish();
		setSelectedNode(node.id);
	};
	const move = ({ direction }: { direction: number }) => {
		finish();
		const list = [...latest.current];
		const i = list.findIndex((e) => e.id === active.id);
		const gradeIndex = grades.findIndex((e) => e.id === active.id);
		const target = grades[gradeIndex + direction];
		if (i < 0 || !target) return;
		const j = list.findIndex((e) => e.id === target.id);
		[list[i], list[j]] = [list[j], list[i]];
		preview(list);
		finish();
	};
	const applyGrades = ({ source }: { source: Effect[] }) => {
		finish();
		clearAnimation({
			ids: latest.current
				.filter((e) => e.type === COLOR_GRADE_TYPE)
				.map((e) => e.id),
		});
		const next = source.map((e) => ({
			...structuredClone(e),
			id: generateUUID(),
		}));
		preview([
			...latest.current.filter((e) => e.type !== COLOR_GRADE_TYPE),
			...next,
		]);
		finish();
		setSelectedNode(next[0]?.id ?? null);
	};
	const snapshotGrades = () =>
		structuredClone(
			latest.current
				.filter((e) => e.type === COLOR_GRADE_TYPE)
				.map((e) => ({
					...e,
					params: resolveEffectParamsAtTime({
						effectId: e.id,
						params: e.params,
						animations: animationRef.current,
						localTime,
					}),
				})),
		);
	const grab = async () => {
		finish();
		try {
			const canvas = document.createElement("canvas");
			const source = wasmCompositor.getCanvas();
			canvas.width = 960;
			canvas.height = Math.max(
				1,
				Math.round((960 * source.height) / source.width),
			);
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("No canvas");
			ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
			const still: ColorStill = {
				id: generateUUID(),
				name: `${element.name} · ${new Date().toLocaleTimeString()}`,
				image: canvas.toDataURL("image/jpeg", 0.85),
				grades: snapshotGrades(),
				createdAt: Date.now(),
			};
			await saveStill({ still });
			setStills(await listStills());
			setShowGallery(true);
			toast.success("Still and grade saved to Gallery");
		} catch {
			toast.error("Could not save this still");
		}
	};
	return (
		<div className="color-workspace grade-studio">
			<div className="grade-workspace-toolbar">
				<div>
					<button
						type="button"
						aria-pressed={showGallery}
						onClick={() => setShowGallery(!showGallery)}
					>
						<ImageIcon size={14} />
						Gallery
					</button>
					<button
						type="button"
						onClick={grab}
						disabled={monitor.bypass || monitor.matte}
						title={
							monitor.bypass || monitor.matte
								? "Return to the graded view to capture a still"
								: "Save this frame and its grade"
						}
					>
						<Camera size={14} />
						Grab still
					</button>
					{reference && (
						<button
							type="button"
							aria-pressed={compare}
							onClick={() => setCompare(!compare)}
						>
							<GripHorizontal size={14} />
							Reference wipe
						</button>
					)}
				</div>
				<div>
					<button
						type="button"
						aria-pressed={monitor.bypass}
						onClick={() =>
							useColorMonitorStore.setState({
								bypass: !monitor.bypass,
								matte: false,
							})
						}
					>
						{monitor.bypass ? <EyeOff size={14} /> : <Eye size={14} />}{" "}
						{monitor.bypass ? "Grades bypassed" : "Bypass grades"}
					</button>
					<button
						type="button"
						aria-pressed={monitor.matte}
						disabled={monitor.bypass || !grades.some((g) => g.id === active.id)}
						onClick={() =>
							useColorMonitorStore.setState({ matte: !monitor.matte })
						}
					>
						Highlight matte
					</button>
					<button
						type="button"
						aria-pressed={showTimeline}
						onClick={() => setShowTimeline(!showTimeline)}
					>
						Timeline
					</button>
					<button
						type="button"
						aria-pressed={showNodes}
						onClick={() => setShowNodes(!showNodes)}
					>
						<Layers size={14} />
						Nodes
					</button>
				</div>
			</div>
			<div className="grade-top">
				{showGallery && (
					<aside className="grade-gallery">
						<div className="grade-section-heading">
							<strong>Gallery</strong>
							<span>{stills.length} stills</span>
						</div>
						<div className="grade-gallery-scroll">
							{stills.map((still) => (
								<div key={still.id} className="grade-still">
									<button
										type="button"
										aria-label={`Compare ${still.name}`}
										onClick={() => {
											setReference(still);
											setCompare(true);
										}}
									>
										{/* biome-ignore lint/performance/noImgElement: local IndexedDB data URL in a static desktop app */}
										<img src={still.image} alt={still.name} />
									</button>
									<span title={still.name}>{still.name}</span>
									<div>
										<button
											type="button"
											onClick={() => applyGrades({ source: still.grades })}
										>
											Apply grade
										</button>
										<button
											type="button"
											aria-label={`Delete still ${still.name}`}
											onClick={async () => {
												try {
													await removeStill({ id: still.id });
													setStills(await listStills());
													if (reference?.id === still.id) {
														setReference(null);
														setCompare(false);
													}
												} catch {
													toast.error("Could not delete still");
												}
											}}
										>
											<Trash2 size={12} />
										</button>
									</div>
								</div>
							))}
							{!stills.length && (
								<p className="grade-help">
									Grab a still to save the viewer and its grade. Apply that
									grade to another clip or compare it with a reference wipe.
								</p>
							)}
						</div>
					</aside>
				)}
				<div className="grade-viewer" ref={viewerRef}>
					{children}
					{compare && reference && (
						<div
							className="grade-reference"
							style={{ ...referenceBounds, right: "auto", bottom: "auto" }}
						>
							{/* biome-ignore lint/performance/noImgElement: local reference frame, no image server */}
							<img
								src={reference.image}
								alt="Gallery reference"
								style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}
							/>
							<div
								className="grade-wipe-divider"
								style={{ left: `${wipe}%` }}
							/>
							<label>
								Reference wipe
								<input
									aria-label="Reference wipe position"
									type="range"
									min={0}
									max={100}
									value={wipe}
									onChange={(e) => setWipe(Number(e.target.value))}
								/>
							</label>
						</div>
					)}
				</div>
				{showNodes && (
					<aside className="grade-node-panel">
						<div className="grade-section-heading">
							<strong>Serial nodes</strong>
							<button type="button" onClick={add}>
								<Plus size={12} />
								Add serial
							</button>
						</div>
						<div className="grade-node-graph">
							<span className="grade-node-terminal">INPUT</span>
							{nodes.map((node, index) => (
								<div key={node.id} className="grade-node-wrap">
									<span className="grade-node-wire" />
									<button
										type="button"
										className="grade-node"
										data-active={active.id === node.id}
										data-enabled={node.enabled}
										aria-pressed={active.id === node.id}
										onClick={() => {
											finish();
											setSelectedNode(node.id);
										}}
									>
										<span>{String(index + 1).padStart(2, "0")}</span>
										<Palette size={22} />
										<strong>
											{String(
												node.params.nodeLabel ??
													(index === 0 ? "Primary" : "Correction"),
											)}
										</strong>
										{!node.enabled && <EyeOff size={12} />}
									</button>
								</div>
							))}
							<span className="grade-node-wire" />
							<span className="grade-node-terminal">OUTPUT</span>
						</div>
						<div className="grade-node-settings">
							<label>
								Node name
								<input
									aria-label="Node name"
									value={String(params.nodeLabel ?? "Primary")}
									onChange={(e) => patch({ nodeLabel: e.target.value })}
									onBlur={finish}
								/>
							</label>
							<div>
								<button
									type="button"
									disabled={nodes[0].id === active.id}
									onClick={() => move({ direction: -1 })}
								>
									<ChevronLeft size={13} />
									Earlier
								</button>
								<button
									type="button"
									disabled={nodes[nodes.length - 1].id === active.id}
									onClick={() => move({ direction: 1 })}
								>
									Later
									<ChevronRight size={13} />
								</button>
								<button
									type="button"
									disabled={!grades.length}
									aria-label="Delete selected node"
									onClick={() => {
										clearAnimation();
										preview(latest.current.filter((e) => e.id !== active.id));
										finish();
										setSelectedNode(null);
									}}
								>
									<Trash2 size={13} />
								</button>
							</div>
							<p>
								Nodes process left to right. Each node has its own correction,
								curves, qualifier, window, and key.
							</p>
						</div>
					</aside>
				)}
			</div>
			{strip}
			{showTimeline && (
				<div className="grade-mini-timeline">
					<Timeline />
				</div>
			)}
			<section className="grade-console" aria-label="Color correction">
				<div className="grade-console-toolbar">
					<div className="grade-console-title">
						<Palette size={16} />
						<strong>{String(params.nodeLabel ?? "Primary")}</strong>
						<span className="grade-current-clip">{element.name}</span>
					</div>
					<div className="grade-toolbar-actions">
						<button
							type="button"
							onClick={() => {
								finish();
								copiedGrades = snapshotGrades();
								setClipboardAvailable(copiedGrades.length > 0);
								toast.success("Grade copied");
							}}
						>
							<Copy size={13} />
							Copy grade
						</button>
						<button
							type="button"
							disabled={!clipboardAvailable}
							onClick={() => applyGrades({ source: copiedGrades })}
						>
							<ClipboardPaste size={13} />
							Paste
						</button>
						<button
							type="button"
							aria-pressed={!active.enabled}
							onClick={() => {
								replaceNode({ node: { ...active, enabled: !active.enabled } });
								finish();
							}}
						>
							{active.enabled ? <Eye size={14} /> : <EyeOff size={14} />}{" "}
							{active.enabled ? "Bypass node" : "Node bypassed"}
						</button>
						<button
							type="button"
							onClick={() => {
								clearAnimation();
								replaceNode({
									node: {
										...active,
										params: {
											...COLOR_DEFAULTS,
											nodeLabel: params.nodeLabel ?? "Primary",
										},
										enabled: true,
									},
								});
								finish();
							}}
						>
							<RotateCcw size={13} />
							Reset node
						</button>
					</div>
				</div>
				<div className="grade-studio-console">
					<ColorPalettes
						params={params}
						patch={patch}
						commit={finish}
						element={element}
						trackId={trackId}
						keyframes={
							<ColorKeyframes
								element={renderElement}
								trackId={trackId}
								effect={active}
								params={params}
								patch={patch}
								commit={finish}
								ensureNode={() => {
									if (!latest.current.some((e) => e.id === active.id)) {
										replaceNode({ node: active });
										finish();
									}
								}}
							/>
						}
					/>
					<ColorScopes />
				</div>
			</section>
		</div>
	);
}
