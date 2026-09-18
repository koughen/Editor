"use client";
import { useRef, useEffect, useState } from "react";
import { audioCurvedFade, audioCrossfadeOverlap } from "opencut-wasm";
import { useEditor } from "@/editor/use-editor";
import { TICKS_PER_SECOND } from "@/wasm";
import type { AudioCapableElement } from "@/timeline/audio-state";
import type { FadeCurve } from "../types";
export function ClipFadeCurves({
	element,
	trackId,
}: {
	element: AudioCapableElement;
	trackId: string;
}) {
	const editor = useEditor();
	return (
		<div className="audio-fade-curves">
			{(["fadeInCurve", "fadeOutCurve"] as const).map((field, i) => (
				<label key={field}>
					{i === 0 ? "Fade-in shape" : "Fade-out shape"}
					<select
						value={element[field] ?? "linear"}
						onChange={(e) =>
							editor.timeline.updateElements({
								updates: [
									{
										trackId,
										elementId: element.id,
										patch: { [field]: e.target.value as FadeCurve },
									},
								],
							})
						}
					>
						<option value="linear">Linear</option>
						<option value="equalPower">Equal power</option>
						<option value="sCurve">S curve</option>
					</select>
				</label>
			))}
		</div>
	);
}
export function CrossfadeSelection() {
	const editor = useEditor();
	const selected = useEditor((e) => e.selection.getSelectedElements());
	const [message, setMessage] = useState("");
	return (
		<>
			<button
				type="button"
				disabled={selected.length !== 2}
				onClick={() => {
					const tracks = editor.scenes.getActiveScene().tracks;
					const audio = [
						...tracks.audio,
						...tracks.overlay.filter((t) => t.type === "video"),
						tracks.main,
					];
					const clips = selected
						.map((ref) => ({
							ref,
							element: audio
								.find((t) => t.id === ref.trackId)
								?.elements.find((e) => e.id === ref.elementId),
						}))
						.filter(
							(
								v,
							): v is {
								ref: (typeof selected)[number];
								element: AudioCapableElement;
							} => v.element?.type === "audio" || v.element?.type === "video",
						)
						.sort((a, b) => a.element.startTime - b.element.startTime);
					if (clips.length !== 2) {
						setMessage(
							"Select two audio or video clips with overlapping sound.",
						);
						return;
					}
					const [a, b] = clips;
					const overlap = audioCrossfadeOverlap(
						a.element.startTime / TICKS_PER_SECOND,
						a.element.duration / TICKS_PER_SECOND,
						b.element.startTime / TICKS_PER_SECOND,
						b.element.duration / TICKS_PER_SECOND,
					);
					if (!overlap) {
						setMessage(
							"Overlap the end of the first clip with the beginning of the second on separate tracks, then select both.",
						);
						return;
					}
					editor.timeline.updateElements({
						updates: [
							{
								...a.ref,
								patch: { fadeOut: overlap, fadeOutCurve: "equalPower" },
							},
							{
								...b.ref,
								patch: { fadeIn: overlap, fadeInCurve: "equalPower" },
							},
						],
					});
					setMessage(`Applied a ${overlap.toFixed(2)}s equal-power crossfade.`);
				}}
			>
				Crossfade selection
			</button>
			{message && (
				<span className="audio-crossfade-status" role="status">
					{message}
				</span>
			)}
		</>
	);
}
export function AudioFadeHandles({
	element,
	trackId,
}: {
	element: AudioCapableElement;
	trackId: string;
}) {
	const editor = useEditor();
	const surface = useRef<HTMLDivElement>(null);
	const active = useRef<{ field: "fadeIn" | "fadeOut"; id: number } | null>(
		null,
	);
	const duration = element.duration / TICKS_PER_SECOND;
	useEffect(
		() => () => {
			if (active.current) editor.timeline.discardPreview();
		},
		[editor],
	);
	if (duration <= 0) return null;
	const update = (x: number) => {
		const rect = surface.current?.getBoundingClientRect();
		if (!rect || !active.current) return;
		const t = Math.max(
			0,
			Math.min(duration, ((x - rect.left) / rect.width) * duration),
		);
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						[active.current.field]:
							active.current.field === "fadeIn" ? t : duration - t,
					},
				},
			],
		});
	};
	return (
		<div
			ref={surface}
			className="audio-fade-handles"
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				zIndex: 35,
			}}
		>
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				aria-hidden="true"
				style={{
					position: "absolute",
					width: "100%",
					height: "100%",
					overflow: "visible",
				}}
			>
				<path
					d={Array.from(
						{ length: 101 },
						(_, i) =>
							`${i ? "L" : "M"}${i},${100 - audioCurvedFade((i / 100) * duration, duration, element.fadeIn ?? 0, element.fadeOut ?? 0, element.fadeInCurve ?? "linear", element.fadeOutCurve ?? "linear") * 100}`,
					).join(" ")}
					fill="none"
					stroke="rgba(255,255,255,.65)"
					strokeWidth="1"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			{(["fadeIn", "fadeOut"] as const).map((field) => (
				<button
					key={field}
					type="button"
					aria-label={field === "fadeIn" ? "Adjust fade in" : "Adjust fade out"}
					title={`${field === "fadeIn" ? "Fade in" : "Fade out"}: ${(element[field] ?? 0).toFixed(2)}s · drag or use arrow keys`}
					style={{
						position: "absolute",
						left: `${(field === "fadeIn" ? (element.fadeIn ?? 0) / duration : 1 - (element.fadeOut ?? 0) / duration) * 100}%`,
						top: 2,
						transform:
							field === "fadeIn" ? "translateX(0)" : "translateX(-100%)",
						width: 10,
						height: 10,
						background: "#dedede",
						border: "1px solid #171717",
						borderRadius: 2,
						pointerEvents: "auto",
						cursor: "ew-resize",
						touchAction: "none",
					}}
					onMouseDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
						active.current = { field, id: e.pointerId };
						e.currentTarget.setPointerCapture(e.pointerId);
						update(e.clientX);
					}}
					onPointerMove={(e) => {
						if (active.current?.id === e.pointerId) {
							e.stopPropagation();
							update(e.clientX);
						}
					}}
					onPointerUp={(e) => {
						if (active.current) {
							e.stopPropagation();
							editor.timeline.commitPreview();
							active.current = null;
							e.currentTarget.releasePointerCapture(e.pointerId);
						}
					}}
					onPointerCancel={() => {
						editor.timeline.discardPreview();
						active.current = null;
					}}
					onKeyDown={(e) => {
						if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
						e.preventDefault();
						e.stopPropagation();
						const sign =
							(e.key === "ArrowRight" ? 1 : -1) * (field === "fadeIn" ? 1 : -1);
						editor.timeline.updateElements({
							updates: [
								{
									trackId,
									elementId: element.id,
									patch: {
										[field]: Math.max(
											0,
											Math.min(
												duration,
												(element[field] ?? 0) +
													sign * (e.shiftKey ? 0.1 : 0.01),
											),
										),
									},
								},
							],
						});
					}}
				/>
			))}
		</div>
	);
}
