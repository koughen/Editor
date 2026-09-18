import { useEffect, useState } from "react";
import type { AudioMixSettings } from "../types";

export function Equalizer({ settings }: { settings: AudioMixSettings }) {
	const [curve, setCurve] = useState("");
	const {
		eqEnabled,
		bypass,
		highPass,
		lowGain,
		lowMidGain,
		lowMidFreq,
		highMidGain,
		highMidFreq,
		highGain,
	} = settings;
	useEffect(() => {
		const context = new OfflineAudioContext(1, 1, 48000);
		const frequencies = Float32Array.from(
			{ length: 160 },
			(_, i) => 20 * 1000 ** (i / 159),
		);
		const response = new Float32Array(160).fill(1);
		const magnitudes = new Float32Array(160);
		const phases = new Float32Array(160);
		const bands: [BiquadFilterType, number, number][] = [
			["highpass", highPass > 20 ? highPass : 0, 0],
			["lowshelf", 120, lowGain],
			["peaking", lowMidFreq, lowMidGain],
			["peaking", highMidFreq, highMidGain],
			["highshelf", 8000, highGain],
		];
		const extraBands = settings.bands.filter((b) => b.enabled);
		if (eqEnabled && !bypass)
			for (const [type, frequency, gain, q] of [
				...bands.map((b) => [...b, b[0] === "highpass" ? -3 : 1] as const),
				...extraBands.map((b) => [b.kind, b.frequency, b.gain, b.q] as const),
			]) {
				const filter = context.createBiquadFilter();
				filter.type = type;
				filter.frequency.value = frequency;
				filter.gain.value = gain;
				filter.Q.value = q;
				filter.getFrequencyResponse(frequencies, magnitudes, phases);
				for (let i = 0; i < response.length; i++) response[i] *= magnitudes[i];
				filter.disconnect();
			}
		setCurve(
			Array.from(
				response,
				(gain, i) =>
					`${i === 0 ? "M" : "L"}${((i / 159) * 320).toFixed(1)},${Math.max(2, Math.min(138, 70 - 20 * Math.log10(Math.max(0.0001, gain)) * 3)).toFixed(1)}`,
			).join(" "),
		);
	}, [
		settings.bands,
		eqEnabled,
		bypass,
		highPass,
		lowGain,
		lowMidGain,
		lowMidFreq,
		highMidGain,
		highMidFreq,
		highGain,
	]);
	return (
		<div className="audio-eq-graph">
			<svg
				viewBox="0 0 320 140"
				role="img"
				aria-label="Equalizer frequency response, 20 Hz to 20 kHz"
			>
				<title>Equalizer frequency response</title>
				{[16, 70, 124].map((y) => (
					<line key={y} x1="0" x2="320" y1={y} y2={y} />
				))}
				{[74, 181, 288].map((x) => (
					<line key={x} x1={x} x2={x} y1="0" y2="140" />
				))}
				<path d={`${curve} L320,140 L0,140 Z`} className="audio-eq-fill" />
				<path d={curve} className="audio-eq-line" />
				<text x="5" y="13">
					+18
				</text>
				<text x="5" y="67">
					0 dB
				</text>
				<text x="5" y="135">
					−18
				</text>
			</svg>
			<div className="audio-eq-labels">
				<span>20 Hz</span>
				<span>100</span>
				<span>1k</span>
				<span>10k</span>
				<span>20k</span>
			</div>
		</div>
	);
}
