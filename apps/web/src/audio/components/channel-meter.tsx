import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";

export function ChannelMeter({ trackId }: { trackId: string }) {
	const editor = useEditor();
	const left = useRef<HTMLSpanElement>(null);
	const right = useRef<HTMLSpanElement>(null);
	const readout = useRef<HTMLOutputElement>(null);
	const [clipped, setClipped] = useState(false);
	const peak = useRef(0);
	useEffect(() => {
		let frame = 0;
		let previous = 0;
		const draw = (now: number) => {
			if (now - previous > 45) {
				previous = now;
				const meter = editor.audio.readMeter({ trackId });
				const values = [meter.left, meter.right];
				[left, right].forEach((ref, i) => {
					if (ref.current)
						ref.current.style.height = `${Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(0.001, values[i])) + 60) / 60) * 100))}%`;
				});
				const maximum = Math.max(...values);
				peak.current = Math.max(peak.current * 0.98, maximum);
				if (maximum >= 1) setClipped(true);
				if (readout.current)
					readout.current.textContent =
						peak.current < 0.001
							? "−∞"
							: (20 * Math.log10(peak.current)).toFixed(1);
			}
			frame = requestAnimationFrame(draw);
		};
		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	}, [editor, trackId]);
	return (
		<fieldset className="audio-meter" aria-label="Stereo peak meter">
			<button
				type="button"
				className="audio-clip-indicator"
				data-clipped={clipped}
				title="Reset peak hold"
				aria-label="Reset clipping indicator"
				onClick={() => {
					setClipped(false);
					peak.current = 0;
				}}
			>
				{clipped ? "CLIP" : "PEAK"}
			</button>
			<div className="audio-meter-bars">
				<div>
					<span ref={left} />
				</div>
				<div>
					<span ref={right} />
				</div>
			</div>
			<output ref={readout} aria-label="Peak level in dBFS">
				−∞
			</output>
		</fieldset>
	);
}
