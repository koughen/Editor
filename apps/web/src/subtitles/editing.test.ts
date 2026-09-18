import { expect, test } from "bun:test";
import {
	exportSubtitles,
	splitCaptionCue,
	mergeCaptionCues,
	transitionTails,
} from "opencut-wasm";
import { parseSubtitleFile } from "./parse";
import { TICKS_PER_SECOND } from "@/wasm";

test("VTT import and sidecar export preserve cue timing and escaped text", () => {
	const captions = parseSubtitleFile({
		fileName: "captions.vtt",
		input:
			"WEBVTT\n\nNOTE ignored\n\nname\n00:01.005 --> 00:03.250 align:center\n<v Speaker>Hello &amp; welcome</v>\n\n00:04.000 --> 00:04.000\ninvalid",
	}).captions;
	expect(captions).toEqual([
		{ text: "Hello & welcome", startTime: 1.005, duration: 2.245 },
	]);
	const srt = exportSubtitles({ cues: captions, format: "srt" });
	expect(srt).toContain("00:00:01,005 --> 00:00:03,250");
	expect(
		parseSubtitleFile({ fileName: "export.srt", input: srt }).captions[0].text,
	).toBe("Hello & welcome");
});
test("caption split and merge preserve words and complete time interval", () => {
	const original = { text: "one two three four", startTime: 2, duration: 4 };
	const [first, second] = splitCaptionCue({ cue: original, at: 4 });
	expect(mergeCaptionCues({ first, second })).toEqual(original);
	expect(() => splitCaptionCue({ cue: original, at: 6 })).toThrow();
});
test("an incoming dissolve retains the outgoing shot for its full reveal, including short shots", () => {
	const clips = [
		{
			start: 0,
			duration: TICKS_PER_SECOND / 4,
			visual: true,
			inMode: 0,
			inDuration: 0,
		},
		{
			start: TICKS_PER_SECOND / 4,
			duration: TICKS_PER_SECOND * 4,
			visual: true,
			inMode: 1,
			inDuration: 1,
		},
	];
	expect(Array.from(transitionTails({ clips }))).toEqual([TICKS_PER_SECOND, 0]);
	clips[1].inMode = 2;
	expect(Array.from(transitionTails({ clips }))).toEqual([0, 0]);
});
