"use client";
import {
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type PointerEvent,
} from "react";
import {
	GripVertical,
	Maximize2,
	Minimize2,
	MoreHorizontal,
	PanelTop,
	PanelsTopLeft,
	MoveDiagonal2,
} from "lucide-react";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/timeline/components";
import { TextView } from "@/text/components/assets-view";
import { Captions } from "@/subtitles/components/assets-view";
import { EffectsView } from "@/effects/components/assets-view";
import { TransitionsView } from "@/transitions/components/assets-view";
import {
	ResizablePanel,
	ResizablePanelGroup,
	ResizableHandle,
} from "@/components/ui/resizable";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { useWorkspaceStore } from "../store";
import {
	PANEL_NAMES,
	allGroups,
	activatePanel,
	closePanel,
	floatPanel,
	mapNode,
	movePanel,
	type DockGroup,
	type DockNode,
	type DockPanel,
	type DockZone,
	type FloatingGroup,
} from "../layout";
import "./workspace.css";

export function EditWorkspace({ children }: { children: ReactNode }) {
	const editor = useEditor();
	const state = useWorkspaceStore();
	const rootRef = useRef<HTMLDivElement>(null);
	const [dragging, setDragging] = useState<DockPanel | null>(null);
	const dragSession = useRef<{
		panel: DockPanel;
		x: number;
		y: number;
		active: boolean;
	} | null>(null);
	const suppressClick = useRef(false);
	const [saveName, setSaveName] = useState("");
	const [saving, setSaving] = useState(false);
	const assetTab = useAssetsPanelStore((s) => s.activeTab);
	const lastAssetTab = useRef(assetTab);
	useEffect(() => {
		if (lastAssetTab.current === assetTab) return;
		lastAssetTab.current = assetTab;
		const panel: DockPanel =
			assetTab === "text"
				? "titles"
				: ["captions", "effects", "transitions"].includes(assetTab)
					? (assetTab as DockPanel)
					: "assets";
		const { layout, setLayout } = useWorkspaceStore.getState();
		setLayout(activatePanel({ layout, panel }));
	}, [assetTab]);
	useEffect(() => () => editor.timeline.commitPreview(), [editor]);
	useEffect(() => {
		let hovered: HTMLElement | null = null;
		const clearHover = () => {
			if (hovered) delete hovered.dataset.over;
			hovered = null;
		};
		const targetAt = (event: globalThis.PointerEvent) =>
			document
				.elementFromPoint(event.clientX, event.clientY)
				?.closest<HTMLElement>("[data-dock-target]") ?? null;
		const pointerMove = (event: globalThis.PointerEvent) => {
			const session = dragSession.current;
			if (!session) return;
			if (
				!session.active &&
				Math.hypot(event.clientX - session.x, event.clientY - session.y) > 6
			) {
				session.active = true;
				setDragging(session.panel);
			}
			if (!session.active) return;
			event.preventDefault();
			clearHover();
			hovered = targetAt(event);
			if (hovered) hovered.dataset.over = "true";
		};
		const cancel = () => {
			dragSession.current = null;
			setDragging(null);
			clearHover();
		};
		const pointerUp = (event: globalThis.PointerEvent) => {
			const session = dragSession.current;
			if (session?.active) {
				const target = targetAt(event);
				if (target?.dataset.dockTarget) {
					const current = useWorkspaceStore.getState();
					current.setLayout(
						movePanel({
							layout: current.layout,
							panel: session.panel,
							target: target.dataset.dockTarget,
							zone: (target.dataset.dockZone ?? "center") as DockZone,
							index:
								target.dataset.dockIndex == null
									? undefined
									: Number(target.dataset.dockIndex),
						}),
					);
				}
				suppressClick.current = true;
				window.setTimeout(() => {
					suppressClick.current = false;
				}, 0);
			}
			cancel();
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				cancel();
				useWorkspaceStore.getState().maximize(null);
			}
		};
		window.addEventListener("pointermove", pointerMove, { passive: false });
		window.addEventListener("pointerup", pointerUp);
		window.addEventListener("pointercancel", cancel);
		window.addEventListener("blur", cancel);
		window.addEventListener("keydown", handleEscape);
		return () => {
			window.removeEventListener("pointermove", pointerMove);
			window.removeEventListener("pointerup", pointerUp);
			window.removeEventListener("pointercancel", cancel);
			window.removeEventListener("blur", cancel);
			window.removeEventListener("keydown", handleEscape);
			clearHover();
		};
	}, []);
	const open = ({ panel }: { panel: DockPanel }) => {
		editor.timeline.commitPreview();
		state.setLayout(activatePanel({ layout: state.layout, panel }));
	};
	const move = ({
		panel,
		target,
		zone,
		index,
	}: {
		panel: DockPanel;
		target: string;
		zone: DockZone;
		index?: number;
	}) => {
		editor.timeline.commitPreview();
		state.setLayout(
			movePanel({ layout: state.layout, panel, target, zone, index }),
		);
		setDragging(null);
	};
	const content = ({ panel }: { panel: DockPanel }) => {
		switch (panel) {
			case "assets":
				return <AssetsPanel />;
			case "preview":
				return children;
			case "properties":
				return <PropertiesPanel />;
			case "timeline":
				return <Timeline />;
			case "titles":
				return <TextView />;
			case "captions":
				return <Captions />;
			case "effects":
				return <EffectsView />;
			case "transitions":
				return <TransitionsView />;
		}
	};
	const renderGroup = ({
		group,
		floating = false,
	}: {
		group: DockGroup;
		floating?: boolean;
	}) => (
		<section
			className={`dock-group ${state.maximized === group.id ? "dock-maximized" : ""}`}
			aria-label={`${group.tabs.map((p) => PANEL_NAMES[p]).join(", ")} panel`}
			key={group.id}
		>
			<div className="dock-group-header">
				<div role="tablist" aria-label="Panel tabs" className="dock-tabs">
					{group.tabs.map((panel, index) => (
						<button
							type="button"
							role="tab"
							aria-selected={panel === group.active}
							key={panel}
							data-dock-target={group.id}
							data-dock-zone="center"
							data-dock-index={index}
							onPointerDown={(event) => {
								if (event.button !== 0) return;
								editor.timeline.commitPreview();
								suppressClick.current = false;
								dragSession.current = {
									panel,
									x: event.clientX,
									y: event.clientY,
									active: false,
								};
								event.currentTarget.setPointerCapture(event.pointerId);
							}}
							onClick={() => {
								if (!suppressClick.current) open({ panel });
							}}
							onDoubleClick={() => state.maximize(group.id)}
						>
							<GripVertical size={10} />
							{PANEL_NAMES[panel]}
						</button>
					))}
				</div>
				{group.tabs.length > 0 && (
					<div className="dock-group-actions">
						<button
							type="button"
							title={state.maximized ? "Restore panel" : "Maximize panel"}
							aria-label={
								state.maximized
									? "Restore panel"
									: `Maximize ${PANEL_NAMES[group.active]}`
							}
							onClick={() => state.maximize(group.id)}
						>
							{state.maximized ? (
								<Minimize2 size={12} />
							) : (
								<Maximize2 size={12} />
							)}
						</button>
						<details className="dock-menu">
							<summary aria-label={`Options for ${PANEL_NAMES[group.active]}`}>
								<MoreHorizontal size={15} />
							</summary>
							<div>
								<strong>{PANEL_NAMES[group.active]}</strong>
								<button
									type="button"
									onClick={() => {
										editor.timeline.commitPreview();
										state.setLayout(
											floatPanel({ layout: state.layout, panel: group.active }),
										);
									}}
								>
									Float panel
								</button>
								<label>
									Move panel
									<select
										aria-label={`Move ${PANEL_NAMES[group.active]}`}
										value=""
										onChange={(e) => {
											const [target, zone] = e.target.value.split("|");
											move({
												panel: group.active,
												target,
												zone: zone as DockZone,
											});
										}}
									>
										<option value="">Choose a position…</option>
										{allGroups({ layout: state.layout }).flatMap((target) =>
											(state.layout.floating.some((g) => g.id === target.id)
												? ["center"]
												: ["center", "left", "right", "top", "bottom"]
											).map((zone) => (
												<option
													key={`${target.id}|${zone}`}
													value={`${target.id}|${zone}`}
												>
													{zone === "center"
														? "Tab with"
														: `${zone[0].toUpperCase()}${zone.slice(1)} of`}{" "}
													{target.tabs.length
														? PANEL_NAMES[target.active]
														: "Empty panel"}
												</option>
											)),
										)}
									</select>
								</label>
								<button
									type="button"
									onClick={() => {
										editor.timeline.commitPreview();
										state.setLayout(
											closePanel({ layout: state.layout, panel: group.active }),
										);
									}}
								>
									Close panel
								</button>
							</div>
						</details>
					</div>
				)}
			</div>
			<div className="dock-panel-content">
				{group.tabs.map((panel) => (
					<div
						className="dock-panel-body"
						role="tabpanel"
						aria-label={PANEL_NAMES[panel]}
						key={panel}
						hidden={panel !== group.active}
					>
						{content({ panel })}
					</div>
				))}
				{!group.tabs.length && (
					<div className="dock-empty">
						<PanelsTopLeft size={26} />
						<p>Drop a panel here or open one from Panels.</p>
						<button type="button" onClick={() => open({ panel: "assets" })}>
							Open Project
						</button>
					</div>
				)}
				{dragging && (
					<div className="dock-targets">
						{(floating
							? ["center"]
							: ["left", "right", "top", "bottom", "center"]
						).map((zone) => (
							<button
								type="button"
								onClick={() =>
									move({
										panel: dragging,
										target: group.id,
										zone: zone as DockZone,
									})
								}
								key={zone}
								data-dock-target={group.id}
								data-dock-zone={zone}
								className={`dock-target dock-target-${zone}`}
								onDragOver={(e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = "move";
									e.currentTarget.dataset.over = "true";
								}}
								onDragLeave={(e) => {
									delete e.currentTarget.dataset.over;
								}}
								onDrop={(e) => {
									e.preventDefault();
									move({
										panel: dragging,
										target: group.id,
										zone: zone as DockZone,
									});
								}}
							>
								{zone === "center" ? "Group as tabs" : `Dock ${zone}`}
							</button>
						))}
					</div>
				)}
			</div>
		</section>
	);
	const renderNode = ({ node }: { node: DockNode }): ReactNode => {
		if (node.type === "group") return renderGroup({ group: node });
		return (
			<ResizablePanelGroup
				key={`${node.id}:${node.first.id}:${node.second.id}`}
				id={node.id}
				direction={node.direction}
				onLayout={(sizes) => {
					if (sizes[0] == null || Math.abs(sizes[0] - node.ratio) < 0.1) return;
					const current = useWorkspaceStore.getState();
					current.setLayout({
						...current.layout,
						root: mapNode({
							node: current.layout.root,
							update: (n) =>
								n.id === node.id && n.type === "split"
									? { ...n, ratio: sizes[0] }
									: n,
						}),
					});
				}}
			>
				<ResizablePanel
					id={node.first.id}
					order={0}
					defaultSize={node.ratio}
					minSize={10}
				>
					{renderNode({ node: node.first })}
				</ResizablePanel>
				<ResizableHandle className="dock-resize-handle" />
				<ResizablePanel
					id={node.second.id}
					order={1}
					defaultSize={100 - node.ratio}
					minSize={10}
				>
					{renderNode({ node: node.second })}
				</ResizablePanel>
			</ResizablePanelGroup>
		);
	};
	return (
		<div className="edit-workspace">
			<div className="dock-workspace-toolbar">
				<div>
					<PanelsTopLeft size={15} />
					<strong>Edit workspace</strong>
					<span>Drag panel tabs to rearrange</span>
				</div>
				<div>
					<details className="dock-menu">
						<summary>
							<PanelTop size={13} /> Panels
						</summary>
						<div>
							{Object.entries(PANEL_NAMES).map(([panel, name]) => (
								<button
									key={panel}
									type="button"
									onClick={() => open({ panel: panel as DockPanel })}
								>
									{name}
									<span>
										{allGroups({ layout: state.layout }).some((g) =>
											g.tabs.includes(panel as DockPanel),
										)
											? "Open"
											: "Show"}
									</span>
								</button>
							))}
						</div>
					</details>
					<select
						aria-label="Workspace layout"
						value=""
						onChange={(e) => {
							editor.timeline.commitPreview();
							e.target.value.startsWith("saved:")
								? state.load(e.target.value.slice(6))
								: state.preset(e.target.value);
						}}
					>
						<option value="">Workspaces</option>
						{["Editing", "Captions", "Effects", "Timeline"].map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
						{state.saved.map((s) => (
							<option key={s.name} value={`saved:${s.name}`}>
								{s.name} · Saved
							</option>
						))}
					</select>
					<button type="button" onClick={() => setSaving(!saving)}>
						Save layout
					</button>
					<button
						type="button"
						onClick={() => {
							editor.timeline.commitPreview();
							state.preset("Editing");
						}}
					>
						Reset layout
					</button>
				</div>
			</div>
			{saving && (
				<form
					className="dock-save"
					onSubmit={(e) => {
						e.preventDefault();
						if (saveName.trim()) {
							state.save(saveName);
							setSaving(false);
							setSaveName("");
						}
					}}
				>
					<label>
						Layout name
						<input
							aria-label="Layout name"
							maxLength={60}
							value={saveName}
							onChange={(e) => setSaveName(e.target.value)}
							placeholder="My editing desk"
						/>
					</label>
					<button type="submit" disabled={!saveName.trim()}>
						Save
					</button>
					<button type="button" onClick={() => setSaving(false)}>
						Cancel
					</button>
				</form>
			)}
			<div className="dock-surface" ref={rootRef}>
				{renderNode({ node: state.layout.root })}
				{state.layout.floating.map((group) => (
					<FloatingPanel key={group.id} group={group} rootRef={rootRef}>
						{renderGroup({ group, floating: true })}
					</FloatingPanel>
				))}
			</div>
		</div>
	);
}

function FloatingPanel({
	group,
	rootRef,
	children,
}: {
	group: FloatingGroup;
	rootRef: React.RefObject<HTMLDivElement | null>;
	children: ReactNode;
}) {
	const session = useRef<{
		x: number;
		y: number;
		initial: FloatingGroup;
		resize: boolean;
	} | null>(null);
	const start = ({
		event,
		resize,
	}: {
		event: PointerEvent<HTMLButtonElement>;
		resize: boolean;
	}) => {
		session.current = {
			x: event.clientX,
			y: event.clientY,
			initial: group,
			resize,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const update = (event: PointerEvent<HTMLButtonElement>) => {
		const s = session.current,
			rect = rootRef.current?.getBoundingClientRect();
		if (!s || !rect) return;
		const dx = ((event.clientX - s.x) / rect.width) * 100,
			dy = ((event.clientY - s.y) / rect.height) * 100;
		const patch = s.resize
			? {
					width: Math.max(20, Math.min(100 - group.x, s.initial.width + dx)),
					height: Math.max(25, Math.min(100 - group.y, s.initial.height + dy)),
				}
			: {
					x: Math.max(0, Math.min(100 - group.width, s.initial.x + dx)),
					y: Math.max(0, Math.min(100 - group.height, s.initial.y + dy)),
				};
		const state = useWorkspaceStore.getState();
		state.setLayout({
			...state.layout,
			floating: state.layout.floating.map((g) =>
				g.id === group.id ? { ...g, ...patch } : g,
			),
		});
	};
	return (
		<div
			className="dock-floating"
			style={{
				left: `${group.x}%`,
				top: `${group.y}%`,
				width: `${group.width}%`,
				height: `${group.height}%`,
			}}
		>
			<button
				type="button"
				className="dock-float-grip"
				aria-label="Move floating panel"
				onPointerDown={(e) => start({ event: e, resize: false })}
				onPointerMove={update}
				onPointerUp={() => {
					session.current = null;
				}}
				onLostPointerCapture={() => {
					session.current = null;
				}}
			>
				Floating · drag to move
			</button>
			{children}
			<button
				type="button"
				className="dock-float-resize"
				aria-label="Resize floating panel"
				onPointerDown={(e) => start({ event: e, resize: true })}
				onPointerMove={update}
				onPointerUp={() => {
					session.current = null;
				}}
				onLostPointerCapture={() => {
					session.current = null;
				}}
			>
				<MoveDiagonal2 size={14} />
			</button>
		</div>
	);
}
