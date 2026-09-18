"use client";
import { useState } from "react";
import { Diamond, Trash2 } from "lucide-react";
import { useEditor } from "@/editor/use-editor";
import { COLOR_PARAMS } from "@/effects/definitions/color-grade";
import {
	buildEffectParamPath,
	getElementKeyframes,
	getKeyframeAtTime,
} from "@/animation";
import type { VideoElement, ImageElement } from "@/timeline";
import type { Effect } from "@/effects/types";
import type { ParamValues } from "@/params";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { addMediaTime, mediaTime, mediaTimeToSeconds } from "@/wasm";
import { GradeSlider } from "./grade-slider";

export function ColorKeyframes({
	element,
	trackId,
	effect,
	params,
	patch,
	commit,
	ensureNode,
}: {
	element: VideoElement | ImageElement;
	trackId: string;
	effect: Effect;
	params: ParamValues;
	patch: (values: ParamValues) => void;
	commit: () => void;
	ensureNode: () => void;
}) {
	const editor = useEditor();
	const [paramKey, setParamKey] = useState("exposure");
	const [interpolation, setInterpolation] = useState<"linear" | "hold">(
		"linear",
	);
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const param = COLOR_PARAMS.find((p) => p.key === paramKey) ?? COLOR_PARAMS[0];
	const path = buildEffectParamPath({ effectId: effect.id, paramKey });
	const keys = getElementKeyframes({ animations: element.animations })
		.filter((k) => k.propertyPath === path)
		.sort((a, b) => a.time - b.time);
	const atTime = getKeyframeAtTime({
		animations: element.animations,
		propertyPath: path,
		time: localTime,
	});
	return (
		<div className="grade-keyframes">
			<div className="grade-subtoolbar">
				<strong>Keyframes</strong>
				<select
					aria-label="Animated control"
					value={paramKey}
					onChange={(e) => {
						commit();
						setParamKey(e.target.value);
					}}
				>
					{COLOR_PARAMS.map((p) => (
						<option key={p.key} value={p.key}>
							{p.label}
						</option>
					))}
				</select>
				<select
					aria-label="Keyframe interpolation"
					value={interpolation}
					onChange={(e) =>
						setInterpolation(e.target.value as "linear" | "hold")
					}
				>
					<option value="linear">Linear</option>
					<option value="hold">Hold</option>
				</select>
				<button
					type="button"
					disabled={!isPlayheadWithinElementRange}
					onClick={() => {
						commit();
						ensureNode();
						editor.timeline.upsertEffectParamKeyframe({
							trackId,
							elementId: element.id,
							effectId: effect.id,
							paramKey,
							time: localTime,
							value: Number(params[paramKey] ?? param.default),
							interpolation,
						});
					}}
				>
					<Diamond size={12} />
					{atTime ? "Update keyframe" : "Add keyframe"}
				</button>
			</div>
			<div className="grade-fields">
				<GradeSlider
					param={param}
					value={Number(params[paramKey] ?? param.default)}
					onPreview={(n) => patch({ [paramKey]: n })}
					onCommit={commit}
				/>
			</div>
			<div className="grade-keyframe-ruler">
				<input
					aria-label="Clip playhead"
					type="range"
					min={0}
					max={element.duration}
					step={1}
					value={localTime}
					onChange={(e) => {
						commit();
						editor.playback.seek({
							time: addMediaTime({
								a: element.startTime,
								b: mediaTime({ ticks: Number(e.target.value) }),
							}),
						});
					}}
				/>
			</div>
			<div className="grade-keyframe-list">
				{keys.map((k) => (
					<div key={k.id}>
						<button
							type="button"
							onClick={() => {
								commit();
								editor.playback.seek({
									time: addMediaTime({ a: element.startTime, b: k.time }),
								});
							}}
						>
							<Diamond size={12} />
							{mediaTimeToSeconds({ time: k.time }).toFixed(3)}s
						</button>
						<span>{Number(k.value).toFixed(3)}</span>
						<button
							type="button"
							aria-label={`Remove keyframe at ${k.time}`}
							onClick={() =>
								editor.timeline.removeEffectParamKeyframe({
									trackId,
									elementId: element.id,
									effectId: effect.id,
									paramKey,
									keyframeId: k.id,
								})
							}
						>
							<Trash2 size={12} />
						</button>
					</div>
				))}
			</div>
			<p className="grade-help">
				{keys.length
					? "Move the playhead and adjust a control to add or change an animated value. Window positions can be animated here too."
					: "Add a keyframe, move the playhead, then change the control to animate it. Each node has its own animation."}
			</p>
		</div>
	);
}
