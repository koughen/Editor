"use client";
import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { buildDefaultEffectInstance } from "@/effects";
import { TRANSITIONS, TRANSITION_TYPE } from "../definition";
import { isVisualElement } from "@/timeline";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";

export function TransitionsView() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveScene()?.tracks);
	const { selectedElements } = useElementSelection();
	const selected = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(({ element }) => isVisualElement(element));
	const [edge, setEdge] = useState<"in" | "out">("in");
	const [duration, setDuration] = useState(0.5);
	const [search, setSearch] = useState("");
	const first = selected[0]?.element;
	const current =
		first && "effects" in first
			? first.effects?.find((effect) => effect.type === TRANSITION_TYPE)
			: undefined;
	const apply = ({ mode }: { mode: number }) =>
		editor.timeline.updateElements({
			updates: selected.map(({ track, element }) => {
				const effects = "effects" in element ? (element.effects ?? []) : [];
				const transition =
					effects.find((effect) => effect.type === TRANSITION_TYPE) ??
					buildDefaultEffectInstance({ effectType: TRANSITION_TYPE });
				return {
					trackId: track.id,
					elementId: element.id,
					patch: {
						effects: [
							...effects.filter((effect) => effect.type !== TRANSITION_TYPE),
							{
								...transition,
								enabled: true,
								params: {
									...transition.params,
									[`${edge}Mode`]: mode,
									[`${edge}Duration`]: duration,
								},
							},
						],
					},
				};
			}),
		});
	return (
		<PanelView title="Transitions">
			<div className="edit-tools">
				<p className="edit-help">
					{selected.length
						? `${selected.length} selected clip${selected.length === 1 ? "" : "s"}`
						: "Select a video, image, title, or graphic on the timeline."}
				</p>
				<div className="edit-segmented">
					<button
						type="button"
						aria-pressed={edge === "in"}
						onClick={() => setEdge("in")}
					>
						Entrance / cut
					</button>
					<button
						type="button"
						aria-pressed={edge === "out"}
						onClick={() => setEdge("out")}
					>
						Exit
					</button>
				</div>
				<label>
					Duration · seconds
					<input
						aria-label="Transition duration"
						type="number"
						min="0.05"
						max="5"
						step="0.05"
						value={duration}
						onChange={(e) =>
							setDuration(
								Math.max(0.05, Math.min(5, Number(e.target.value) || 0.5)),
							)
						}
					/>
				</label>
				{current && (
					<p className="edit-help">
						Current {edge === "in" ? "entrance" : "exit"}:{" "}
						{TRANSITIONS.find(
							(t) => t.id === Number(current.params[`${edge}Mode`]),
						)?.name ?? "None"}{" "}
						· {Number(current.params[`${edge}Duration`] ?? 0.5).toFixed(2)}s
					</p>
				)}
				<input
					aria-label="Search transitions"
					placeholder="Search transitions…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<div className="edit-preset-grid">
					{TRANSITIONS.filter((t) =>
						t.name.toLowerCase().includes(search.toLowerCase()),
					).map((t) => (
						<button
							type="button"
							key={t.id}
							disabled={!selected.length}
							className="transition-preset"
							onClick={() => apply({ mode: t.id })}
						>
							<div className={`transition-swatch transition-swatch-${t.id}`}>
								<span>A</span>
								<span>B</span>
							</div>
							<strong>{t.name}</strong>
							<small>
								{t.id === 0
									? "Remove from this edge"
									: `Apply ${duration.toFixed(2)}s`}
							</small>
						</button>
					))}
				</div>
				<p className="edit-help">
					At adjacent video or image cuts, entrance dissolves and reveals blend
					with the previous shot. Available source frames are used; the final
					frame holds if needed. Other entrances and exits fade over the layers
					below. Duration is limited to half the clip.
				</p>
				<button
					type="button"
					disabled={!current}
					onClick={() =>
						editor.timeline.updateElements({
							updates: selected.map(({ track, element }) => ({
								trackId: track.id,
								elementId: element.id,
								patch: {
									effects:
										"effects" in element
											? element.effects?.filter(
													(effect) => effect.type !== TRANSITION_TYPE,
												)
											: [],
								},
							})),
						})
					}
				>
					Remove both transitions
				</button>
			</div>
		</PanelView>
	);
}
