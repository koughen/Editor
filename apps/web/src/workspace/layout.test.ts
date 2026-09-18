import { expect, test } from "bun:test";
import {
	defaultLayout,
	groups,
	allGroups,
	movePanel,
	closePanel,
	floatPanel,
	activatePanel,
	isValidLayout,
} from "./layout";
test("docking, floating, closing and reopening preserve each panel exactly once", () => {
	let layout = defaultLayout();
	const viewer = groups({ node: layout.root }).find(
		(g) => g.active === "preview",
	);
	if (!viewer) throw new Error("Missing viewer group");
	layout = movePanel({
		layout,
		panel: "captions",
		target: viewer.id,
		zone: "right",
	});
	expect(isValidLayout(layout)).toBe(true);
	expect(
		allGroups({ layout }).find((g) => g.active === "captions")?.tabs,
	).toEqual(["captions"]);
	layout = floatPanel({ layout, panel: "captions" });
	expect(layout.floating).toHaveLength(1);
	layout = movePanel({
		layout,
		panel: "captions",
		target: viewer.id,
		zone: "center",
	});
	expect(layout.floating).toHaveLength(0);
	expect(allGroups({ layout }).find((g) => g.id === viewer.id)?.tabs).toEqual([
		"preview",
		"captions",
	]);
	layout = closePanel({ layout, panel: "captions" });
	layout = activatePanel({ layout, panel: "captions" });
	expect(
		allGroups({ layout })
			.flatMap((g) => g.tabs)
			.filter((p) => p === "captions"),
	).toHaveLength(1);
	expect(isValidLayout(layout)).toBe(true);
});
test("a completely closed workspace can recover and malformed layouts are rejected", () => {
	let layout = defaultLayout();
	for (const panel of allGroups({ layout }).flatMap((g) => g.tabs))
		layout = closePanel({ layout, panel });
	layout = activatePanel({ layout, panel: "preview" });
	expect(groups({ node: layout.root })[0].tabs).toEqual(["preview"]);
	expect(isValidLayout({ root: {}, floating: [] })).toBe(false);
	const duplicate = defaultLayout();
	duplicate.floating.push({
		...groups({ node: duplicate.root })[0],
		x: 0,
		y: 0,
		width: 40,
		height: 50,
	});
	expect(isValidLayout(duplicate)).toBe(false);
});

test("panels can dock back into an empty workspace after all panels are floated", () => {
	let layout = defaultLayout();
	const panels = allGroups({ layout }).flatMap((group) => group.tabs);
	for (const panel of panels) layout = floatPanel({ layout, panel });
	expect(groups({ node: layout.root })[0].tabs).toHaveLength(0);
	layout = movePanel({
		layout,
		panel: "preview",
		target: layout.root.id,
		zone: "center",
	});
	expect(groups({ node: layout.root })[0].tabs).toEqual(["preview"]);
	expect(
		allGroups({ layout })
			.flatMap((group) => group.tabs)
			.sort(),
	).toEqual(panels.sort());
	expect(isValidLayout(layout)).toBe(true);
});
