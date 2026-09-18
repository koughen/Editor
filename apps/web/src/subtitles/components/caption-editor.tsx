"use client";
import { useState } from "react";
import {
	exportSubtitles,
	splitCaptionCue,
	mergeCaptionCues,
} from "opencut-wasm";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import type { TextElement } from "@/timeline";
import {
	BatchCommand,
	InsertElementCommand,
	UpdateElementsCommand,
	DeleteElementsCommand,
} from "@/commands";
import { buildTextElement } from "@/timeline/element-utils";
import { buildSubtitleTextElement } from "../build-subtitle-text-element";
import { insertCaptionChunksAsTextTrack } from "../insert";
import { TEXT_PRESETS } from "@/text/presets";
import { downloadBlob } from "@/utils/browser";
import type { CaptionChunk } from "@/transcription/types";

function cueOf({ element }: { element: TextElement }): CaptionChunk {
	return {
		text: element.content,
		startTime: mediaTimeToSeconds({ time: element.startTime }),
		duration: mediaTimeToSeconds({ time: element.duration }),
	};
}
export function CaptionEditor() {
	const editor = useEditor();
	const tracks = useEditor((e) => e.scenes.getActiveScene()?.tracks);
	const { selectedElements, selectElement } = useElementSelection();
	const [trackId, setTrackId] = useState("");
	const [search, setSearch] = useState("");
	const [styleId, setStyleId] = useState("outlined");
	const textTracks =
		tracks?.overlay.filter((track) => track.type === "text") ?? [];
	const track =
		textTracks.find((t) => t.id === trackId) ??
		textTracks.find((t) =>
			t.elements.some((e) => e.isCaption || /^Caption \d/.test(e.name)),
		) ??
		textTracks[0];
	const cues = (track?.elements ?? [])
		.slice()
		.sort((a, b) => a.startTime - b.startTime);
	const selected = cues.find((cue) =>
		selectedElements.some((ref) => ref.elementId === cue.id),
	);
	const patchCue = ({
		element,
		patch,
	}: {
		element: TextElement;
		patch: Partial<TextElement>;
	}) => {
		if (track)
			editor.timeline.updateElements({
				updates: [{ trackId: track.id, elementId: element.id, patch }],
			});
	};
	const select = ({ element }: { element: TextElement }) => {
		if (!track) return;
		selectElement({ trackId: track.id, elementId: element.id });
		editor.playback.seek({ time: element.startTime });
	};
	const add = () => {
		const caption = {
			text: "New caption",
			startTime: mediaTimeToSeconds({ time: editor.playback.getCurrentTime() }),
			duration: 2,
		};
		if (!track) {
			const id = insertCaptionChunksAsTextTrack({
				editor,
				captions: [caption],
			});
			if (id) setTrackId(id);
			return;
		}
		editor.timeline.insertElement({
			placement: { mode: "explicit", trackId: track.id },
			element: buildSubtitleTextElement({
				index: cues.length,
				caption,
				canvasSize: editor.project.getActive().settings.canvasSize,
			}),
		});
	};
	const split = () => {
		if (!track || !selected) return;
		try {
			const [first, second] = splitCaptionCue({
				cue: cueOf({ element: selected }),
				at: mediaTimeToSeconds({ time: editor.playback.getCurrentTime() }),
			}) as CaptionChunk[];
			editor.command.execute({
				command: new BatchCommand([
					new UpdateElementsCommand({
						updates: [
							{
								trackId: track.id,
								elementId: selected.id,
								patch: {
									content: first.text,
									duration: mediaTimeFromSeconds({ seconds: first.duration }),
								},
							},
						],
					}),
					new InsertElementCommand({
						placement: { mode: "explicit", trackId: track.id },
						element: buildTextElement({
							raw: {
								...selected,
								content: second.text,
								duration: mediaTimeFromSeconds({ seconds: second.duration }),
								animations: undefined,
							},
							startTime: mediaTimeFromSeconds({ seconds: second.startTime }),
						}),
					}),
				]),
			});
		} catch (error) {
			toast.error(String(error));
		}
	};
	const merge = () => {
		if (!track || !selected) return;
		const next = cues[cues.findIndex((c) => c.id === selected.id) + 1];
		if (!next) return;
		const cue = mergeCaptionCues({
			first: cueOf({ element: selected }),
			second: cueOf({ element: next }),
		}) as CaptionChunk;
		editor.command.execute({
			command: new BatchCommand([
				new DeleteElementsCommand({
					elements: [{ trackId: track.id, elementId: next.id }],
				}),
				new UpdateElementsCommand({
					updates: [
						{
							trackId: track.id,
							elementId: selected.id,
							patch: {
								content: cue.text,
								startTime: mediaTimeFromSeconds({ seconds: cue.startTime }),
								duration: mediaTimeFromSeconds({ seconds: cue.duration }),
							},
						},
					],
				}),
			]),
		});
	};
	const save = ({ format }: { format: "srt" | "vtt" }) => {
		const text = exportSubtitles({
			cues: cues.map((element) => cueOf({ element })),
			format,
		});
		downloadBlob({
			blob: new Blob([text], {
				type: format === "vtt" ? "text/vtt" : "application/x-subrip",
			}),
			filename: `captions.${format}`,
		});
	};
	return (
		<PanelView title="Caption editor">
			<div className="edit-tools">
				<label>
					Text / caption track
					<select
						aria-label="Caption track"
						value={track?.id ?? ""}
						onChange={(e) => setTrackId(e.target.value)}
					>
						{!textTracks.length && <option value="">No caption track</option>}
						{textTracks.map((t, i) => (
							<option key={t.id} value={t.id}>
								{t.name || `Text ${i + 1}`} · {t.elements.length} cues
							</option>
						))}
					</select>
				</label>
				<div className="edit-inline">
					<button type="button" onClick={add}>
						+ Add cue
					</button>
					<button type="button" disabled={!selected} onClick={split}>
						Split at playhead
					</button>
					<button
						type="button"
						disabled={!selected || selected.id === cues.at(-1)?.id}
						onClick={merge}
					>
						Merge next
					</button>
				</div>
				<div className="edit-inline">
					<select
						aria-label="Caption style"
						value={styleId}
						onChange={(e) => setStyleId(e.target.value)}
					>
						{TEXT_PRESETS.filter((p) => p.category === "Caption").map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<button
						type="button"
						disabled={!cues.length}
						onClick={() => {
							const preset = TEXT_PRESETS.find((p) => p.id === styleId);
							if (track && preset)
								editor.timeline.updateElements({
									updates: cues.map((element) => ({
										trackId: track.id,
										elementId: element.id,
										patch: preset.style,
									})),
								});
						}}
					>
						Style entire track
					</button>
				</div>
				<div className="edit-inline">
					<button
						type="button"
						disabled={!cues.length}
						onClick={() => save({ format: "srt" })}
					>
						Export SRT
					</button>
					<button
						type="button"
						disabled={!cues.length}
						onClick={() => save({ format: "vtt" })}
					>
						Export VTT
					</button>
					<span className="edit-help">{cues.length} cues</span>
				</div>
				<input
					aria-label="Search captions"
					placeholder="Find caption text…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				{!cues.length && (
					<p className="edit-help">
						Add your first cue, or use Generate / import for local speech
						recognition and SRT, VTT, or ASS files.
					</p>
				)}
				{cues
					.filter((c) => c.content.toLowerCase().includes(search.toLowerCase()))
					.map((cue, index) => (
						<article
							className={`caption-cue ${selected?.id === cue.id ? "is-selected" : ""}`}
							key={cue.id}
						>
							<div className="edit-inline">
								<button type="button" onClick={() => select({ element: cue })}>
									▶ {String(index + 1).padStart(2, "0")}
								</button>
								<small>{cue.name}</small>
								<button
									type="button"
									aria-label={`Delete ${cue.name}`}
									className="caption-delete"
									onClick={() =>
										track &&
										editor.timeline.deleteElements({
											elements: [{ trackId: track.id, elementId: cue.id }],
										})
									}
								>
									×
								</button>
							</div>
							<textarea
								aria-label={`Caption ${index + 1} text`}
								key={`${cue.id}:${cue.content}`}
								defaultValue={cue.content}
								rows={2}
								onFocus={() =>
									track &&
									selectElement({ trackId: track.id, elementId: cue.id })
								}
								onBlur={(e) => {
									if (e.target.value !== cue.content)
										patchCue({
											element: cue,
											patch: { content: e.target.value },
										});
								}}
							/>
							<div className="edit-inline">
								{(["start", "end"] as const).map((edge) => (
									<label key={edge}>
										{edge === "start" ? "Start" : "End"} · sec
										<input
											key={`${cue.id}:${edge}:${cue.startTime}:${cue.duration}`}
											aria-label={`Caption ${index + 1} ${edge}`}
											type="number"
											min="0"
											step="0.01"
											defaultValue={(edge === "start"
												? cueOf({ element: cue }).startTime
												: cueOf({ element: cue }).startTime +
													cueOf({ element: cue }).duration
											).toFixed(3)}
											onBlur={(e) => {
												const value = Number(e.target.value),
													current = cueOf({ element: cue });
												const start =
														edge === "start" ? value : current.startTime,
													end =
														edge === "end"
															? value
															: current.startTime + current.duration;
												if (
													!Number.isFinite(value) ||
													start < 0 ||
													end <= start
												) {
													toast.error(
														"End must be after start, and start cannot be negative",
													);
													e.target.value = (
														edge === "start"
															? current.startTime
															: current.startTime + current.duration
													).toFixed(3);
													return;
												}
												if (
													start !== current.startTime ||
													Math.abs(end - start - current.duration) > 0.00001
												)
													patchCue({
														element: cue,
														patch: {
															startTime: mediaTimeFromSeconds({
																seconds: start,
															}),
															duration: mediaTimeFromSeconds({
																seconds: end - start,
															}),
														},
													});
											}}
										/>
									</label>
								))}
							</div>
						</article>
					))}
			</div>
		</PanelView>
	);
}
