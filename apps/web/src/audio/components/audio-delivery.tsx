"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { exportAudio, analyzeAudio } from "../export";
import { createTimelineAudioBuffer } from "@/media/audio";
import { SILENT_LOUDNESS } from "../worklet";
import type { LoudnessReading } from "../types";
export function LoudnessMeter() {
	const editor = useEditor();
	const [reading, setReading] = useState<LoudnessReading>(SILENT_LOUDNESS);
	useEffect(() => {
		const id = setInterval(
			() => setReading({ ...editor.audio.readLoudness() }),
			200,
		);
		return () => clearInterval(id);
	}, [editor]);
	const value = (v: number | null) => (v === null ? "−∞" : v.toFixed(1));
	return (
		<div className="audio-loudness">
			<div className="audio-loudness-heading">
				<strong>Output loudness</strong>
				<button type="button" onClick={() => editor.audio.resetLoudness()}>
					Reset
				</button>
			</div>
			<div className="audio-loudness-values">
				<div>
					<strong>{value(reading.integrated)}</strong>
					<span>Integrated LUFS</span>
				</div>
				<div>
					<strong>{value(reading.shortTerm)}</strong>
					<span>Short-term LUFS</span>
				</div>
				<div>
					<strong>{value(reading.momentary)}</strong>
					<span>Momentary LUFS</span>
				</div>
				<div data-over={reading.truePeak !== null && reading.truePeak > -1}>
					<strong>{value(reading.truePeak)}</strong>
					<span>True peak dBTP</span>
				</div>
			</div>
			<small>
				Since playback start / reset · {reading.seconds.toFixed(1)}s measured
			</small>
		</div>
	);
}
export function AudioDelivery() {
	const editor = useEditor();
	const [sampleRate, setRate] = useState(48000);
	const [bits, setBits] = useState(24);
	const [tail, setTail] = useState(3);
	const [stems, setStems] = useState(false);
	const [target, setTarget] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [report, setReport] = useState<LoudnessReading | null>(null);
	const cancel = useRef<AbortController | null>(null);
	useEffect(() => () => cancel.current?.abort(), []);
	const perform = async (measure: boolean) => {
		const controller = new AbortController();
		cancel.current = controller;
		setBusy(true);
		setMessage(
			measure ? "Rendering and measuring the full mix…" : "Preparing audio…",
		);
		try {
			const scene = editor.scenes.getActiveScene();
			const options = {
				tracks: scene.tracks,
				mediaAssets: editor.media.getAssets(),
				duration: editor.timeline.getTotalDuration(),
				sampleRate,
				tailSeconds: tail,
				signal: controller.signal,
			};
			if (measure) {
				const buffer = await createTimelineAudioBuffer(options);
				if (!buffer) throw new Error("Add audio to the timeline first.");
				const reading = await analyzeAudio({
					buffer,
					signal: controller.signal,
				});
				setReport(reading);
				setMessage("Full-mix measurement complete.");
			} else
				setMessage(
					await exportAudio({
						...options,
						name: editor.project.getActive()?.metadata.name ?? "Audio mix",
						bits,
						stems,
						target: target ? Number(target) : null,
						onProgress: setMessage,
					}),
				);
		} catch (e) {
			setMessage(
				controller.signal.aborted
					? "Export cancelled."
					: e instanceof Error
						? e.message
						: String(e),
			);
		} finally {
			setBusy(false);
			cancel.current = null;
		}
	};
	return (
		<div className="audio-delivery">
			<h3>Audio export</h3>
			<p className="audio-effect-hint">
				WAV files include your clip edits, automation, routing, effects and
				Audio Units.
			</p>
			<div className="audio-export-options">
				<label>
					Sample rate
					<select
						disabled={busy}
						value={sampleRate}
						onChange={(e) => setRate(Number(e.target.value))}
					>
						{[44100, 48000, 96000].map((r) => (
							<option key={r} value={r}>
								{r / 1000} kHz
							</option>
						))}
					</select>
				</label>
				<label>
					Bit depth
					<select
						disabled={busy}
						value={bits}
						onChange={(e) => setBits(Number(e.target.value))}
					>
						<option value={16}>16-bit PCM</option>
						<option value={24}>24-bit PCM</option>
						<option value={32}>32-bit float</option>
					</select>
				</label>
			</div>
			<label className="audio-select-label">
				Effect tail
				<select
					disabled={busy}
					value={tail}
					onChange={(e) => setTail(Number(e.target.value))}
				>
					{[0, 1, 3, 5, 10, 20, 30].map((t) => (
						<option key={t} value={t}>
							{t === 0 ? "End at timeline end" : `${t} seconds after timeline`}
						</option>
					))}
				</select>
			</label>
			<label className="audio-select-label">
				Stereo mix loudness
				<select
					disabled={busy}
					value={target}
					onChange={(e) => setTarget(e.target.value)}
				>
					<option value="">Keep current levels</option>
					<option value="-14">−14 LUFS</option>
					<option value="-16">−16 LUFS</option>
					<option value="-23">−23 LUFS</option>
				</select>
			</label>
			{target && (
				<p className="audio-effect-hint">
					Gain is limited to keep true peak at or below −1 dBTP. A very dynamic
					mix may finish below the loudness target.
				</p>
			)}
			<label className="audio-toggle">
				<input
					disabled={busy}
					type="checkbox"
					checked={stems}
					onChange={(e) => setStems(e.target.checked)}
				/>
				Include separate track and group stems
			</label>
			<p className="audio-effect-hint">
				Stems start at timeline zero and preserve effects, shared sends and
				ducking. Master effects and normalization apply to the stereo mix only.
				Shared nonlinear processing can change how stems sum.
			</p>
			<button
				className="audio-wide-button"
				type="button"
				disabled={busy}
				onClick={() => void perform(true)}
			>
				Analyze full mix
			</button>
			{report && (
				<div className="audio-analysis-result">
					<strong>{report.integrated?.toFixed(1) ?? "−∞"} LUFS</strong>
					<span>
						{report.truePeak?.toFixed(1) ?? "−∞"} dBTP ·{" "}
						{report.range?.toFixed(1) ?? "—"} LU range
					</span>
				</div>
			)}
			<button
				className="audio-wide-button audio-export-primary"
				type="button"
				disabled={busy}
				onClick={() => void perform(false)}
			>
				{busy
					? "Working…"
					: stems
						? "Export WAV mix + stems"
						: "Export WAV mix"}
			</button>
			{busy && (
				<button
					className="audio-wide-button"
					type="button"
					onClick={() => cancel.current?.abort()}
				>
					Cancel
				</button>
			)}
			{message && (
				<p className="audio-export-message" role="status">
					{message}
				</p>
			)}
		</div>
	);
}
