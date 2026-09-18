"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { isVisualElement } from "@/timeline";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import {
	effectsRegistry,
	EFFECT_TARGET_ELEMENT_TYPES,
	buildDefaultEffectInstance,
} from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import type { EffectDefinition } from "@/effects/types";

export function EffectsView({
	initialTarget = "selected",
}: {
	initialTarget?: "selected" | "layer";
}) {
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("All");
	const [target, setTarget] = useState<"selected" | "layer">(initialTarget);
	const categories: Record<string, string[]> = {
		Color: ["color-grade", "sepia", "duotone", "posterize"],
		Texture: ["film-grain", "pixelate"],
		Optical: ["blur", "vignette", "chromatic-aberration", "sharpen"],
	};
	const effects = effectsRegistry
		.getAll()
		.filter(
			(effect) =>
				effect.type !== "clip-transition" &&
				(category === "All" || categories[category]?.includes(effect.type)) &&
				`${effect.name} ${effect.keywords?.join(" ") ?? ""}`
					.toLowerCase()
					.includes(search.toLowerCase()),
		);

	return (
		<PanelView title="Effects">
			<div className="edit-tools">
				<div className="edit-segmented">
					<button
						type="button"
						aria-pressed={target === "selected"}
						onClick={() => setTarget("selected")}
					>
						Selected clips
					</button>
					<button
						type="button"
						aria-pressed={target === "layer"}
						onClick={() => setTarget("layer")}
					>
						Adjustment layer
					</button>
				</div>
				<input
					aria-label="Search effects"
					placeholder="Search effects…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select
					aria-label="Effect category"
					value={category}
					onChange={(e) => setCategory(e.target.value)}
				>
					{["All", ...Object.keys(categories)].map((name) => (
						<option key={name}>{name}</option>
					))}
				</select>
				<p className="edit-help">
					{target === "selected"
						? "Use + to apply to selected clips, or drag an effect onto a clip. Fine-tune its settings in Inspector → Effects."
						: "Use + to add an adjustment layer at the playhead. It affects all visible tracks below it."}
				</p>
				<EffectsGrid effects={effects} target={target} />
				{!effects.length && (
					<p className="edit-help">No effects match this search.</p>
				)}
			</div>
		</PanelView>
	);
}

function EffectsGrid({
	effects,
	target,
}: {
	effects: EffectDefinition[];
	target: "selected" | "layer";
}) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} target={target} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({
	effect,
	target,
}: {
	effect: EffectDefinition;
	target: "selected" | "layer";
}) {
	const editor = useEditor();

	const handleAddToTimeline = useCallback(() => {
		if (target === "selected") {
			const selected = editor.timeline
				.getElementsWithTracks({
					elements: editor.selection.getSelectedElements(),
				})
				.filter(({ element }) => isVisualElement(element));
			if (!selected.length) {
				toast.info(
					"Select a visual clip on the timeline, or choose Adjustment layer",
				);
				return;
			}
			editor.timeline.updateElements({
				updates: selected.map(({ track, element }) => ({
					trackId: track.id,
					elementId: element.id,
					patch: {
						effects: [
							...("effects" in element ? (element.effects ?? []) : []),
							buildDefaultEffectInstance({ effectType: effect.type }),
						],
					},
				})),
			});
			toast.success(`Added ${effect.name}`);
			return;
		}
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type, effect.name, target]);

	const preview = <EffectPreviewCanvas effectType={effect.type} />;

	return (
		<DraggableItem
			name={effect.name}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
