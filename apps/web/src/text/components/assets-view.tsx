"use client";
import { useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import { TEXT_PRESETS, type TextPreset } from "../presets";
import { toast } from "sonner";
export function TextView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	useEditor((e) => e.scenes.getActiveScene()?.tracks);
	const [search, setSearch] = useState("");
	const [content, setContent] = useState("");
	const [duration, setDuration] = useState(4);
	const [target, setTarget] = useState("new");
	const selected = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(({ element }) => element.type === "text");
	const apply = ({ preset }: { preset: TextPreset }) => {
		if (target === "selected") {
			editor.timeline.updateElements({
				updates: selected.map(({ track, element }) => ({
					trackId: track.id,
					elementId: element.id,
					patch: preset.style,
				})),
			});
			toast.success(
				`Styled ${selected.length} text element${selected.length === 1 ? "" : "s"}`,
			);
			return;
		}
		const element = buildTextElement({
			raw: {
				...preset.style,
				name: preset.name,
				content: content.trim() || preset.sample,
				duration: mediaTimeFromSeconds({ seconds: duration }),
				isCaption: preset.category === "Caption",
				transform: {
					...DEFAULTS.text.element.transform,
					position: {
						x: 0,
						y: preset.bottom
							? editor.project.getActive().settings.canvasSize.height * 0.36
							: 0,
					},
				},
			},
			startTime: editor.playback.getCurrentTime(),
		});
		editor.timeline.insertElement({ element, placement: { mode: "auto" } });
	};
	return (
		<PanelView title="Titles & text">
			<div className="edit-tools">
				<div className="edit-segmented">
					<button
						type="button"
						aria-pressed={target === "new"}
						onClick={() => setTarget("new")}
					>
						New title
					</button>
					<button
						type="button"
						aria-pressed={target === "selected"}
						onClick={() => setTarget("selected")}
					>
						Style selected
					</button>
				</div>
				{target === "new" ? (
					<>
						<label>
							Text
							<textarea
								aria-label="New title text"
								rows={3}
								value={content}
								onChange={(e) => setContent(e.target.value)}
								placeholder="Write your title, or use the preset text"
							/>
						</label>
						<label>
							Duration · seconds
							<input
								aria-label="Title duration"
								type="number"
								min="0.1"
								max="600"
								step="0.1"
								value={duration}
								onChange={(e) =>
									setDuration(
										Math.max(0.1, Math.min(600, Number(e.target.value) || 4)),
									)
								}
							/>
						</label>
					</>
				) : (
					<p className="edit-help">
						{selected.length} text elements selected. Text, position, and timing
						are preserved.
					</p>
				)}
				<input
					aria-label="Search title styles"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search titles and captions…"
				/>
				<div className="edit-preset-grid">
					{TEXT_PRESETS.filter((p) =>
						`${p.name} ${p.category}`
							.toLowerCase()
							.includes(search.toLowerCase()),
					).map((preset) => (
						<button
							type="button"
							className="title-preset"
							key={preset.id}
							disabled={target === "selected" && !selected.length}
							onClick={() => apply({ preset })}
						>
							<div
								style={{
									fontFamily: preset.style.fontFamily,
									fontWeight: preset.style.fontWeight,
									fontStyle: preset.style.fontStyle,
									color: preset.style.color,
									textShadow: preset.style.shadow?.blur
										? `0 1px 8px ${preset.style.shadow.color}`
										: undefined,
								}}
							>
								<span
									style={{
										background: preset.style.background?.enabled
											? preset.style.background.color
											: undefined,
									}}
								>
									{preset.sample}
								</span>
							</div>
							<strong>{preset.name}</strong>
							<small>
								{target === "selected" ? "Apply style" : "Add at playhead"} ·{" "}
								{preset.category}
							</small>
						</button>
					))}
				</div>
				<p className="edit-help">
					Select a title on the timeline to edit its typography, background,
					outline, shadow, position, and animation in Inspector.
				</p>
			</div>
		</PanelView>
	);
}
