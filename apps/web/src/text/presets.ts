import type { TextElement } from "@/timeline";
import { DEFAULTS } from "@/timeline/defaults";
export interface TextPreset {
	id: string;
	name: string;
	sample: string;
	category: "Title" | "Caption";
	bottom?: boolean;
	style: Partial<TextElement>;
}
const base: Partial<TextElement> = {
	fontFamily: "Arial",
	fontSize: 8,
	fontWeight: "bold",
	fontStyle: "normal",
	textAlign: "center",
	textDecoration: "none",
	color: "#ffffff",
	letterSpacing: 0,
	lineHeight: 1.15,
	background: { ...DEFAULTS.text.element.background, enabled: false },
	stroke: { color: "#000000", width: 0 },
	shadow: { color: "#000000", blur: 0, offsetX: 0, offsetY: 0 },
};
export const TEXT_PRESETS: TextPreset[] = [
	{
		id: "essential",
		name: "Essential title",
		sample: "THE NEXT CHAPTER",
		category: "Title",
		style: { ...base, letterSpacing: 3 },
	},
	{
		id: "editorial",
		name: "Editorial",
		sample: "A story worth telling",
		category: "Title",
		style: {
			...base,
			fontFamily: "Georgia",
			fontWeight: "normal",
			fontStyle: "italic",
			fontSize: 9,
		},
	},
	{
		id: "lower-third",
		name: "Lower third",
		sample: "ALEX MORGAN\nDirector",
		category: "Title",
		bottom: true,
		style: {
			...base,
			fontSize: 5,
			background: {
				...DEFAULTS.text.element.background,
				enabled: true,
				color: "#171717",
				paddingX: 60,
				paddingY: 36,
				cornerRadius: 8,
			},
		},
	},
	{
		id: "outlined",
		name: "Clean subtitles",
		sample: "Every moment matters",
		category: "Caption",
		bottom: true,
		style: {
			...base,
			fontSize: 5,
			stroke: { color: "#000000", width: 2 },
			shadow: { color: "#000000", blur: 6, offsetX: 0, offsetY: 3 },
		},
	},
	{
		id: "yellow",
		name: "Yellow punch",
		sample: "MAKE IT HAPPEN",
		category: "Caption",
		bottom: true,
		style: {
			...base,
			fontSize: 6,
			color: "#ffd600",
			stroke: { color: "#000000", width: 3 },
		},
	},
	{
		id: "boxed",
		name: "Boxed captions",
		sample: "One idea changes everything",
		category: "Caption",
		bottom: true,
		style: {
			...base,
			fontSize: 5,
			background: {
				...DEFAULTS.text.element.background,
				enabled: true,
				color: "#000000",
				paddingX: 60,
				paddingY: 42,
				cornerRadius: 12,
			},
		},
	},
	{
		id: "neon",
		name: "Electric",
		sample: "AFTER HOURS",
		category: "Title",
		style: {
			...base,
			color: "#fbffed",
			letterSpacing: 5,
			shadow: { color: "#a8ed27", blur: 28, offsetX: 0, offsetY: 0 },
		},
	},
	{
		id: "credits",
		name: "End credits",
		sample: "DIRECTED BY\nYour name",
		category: "Title",
		style: {
			...base,
			fontSize: 4.5,
			fontWeight: "normal",
			letterSpacing: 2,
			lineHeight: 1.7,
		},
	},
];
