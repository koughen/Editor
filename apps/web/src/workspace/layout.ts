export const PANEL_NAMES = {
	assets: "Project",
	preview: "Viewer",
	properties: "Inspector",
	timeline: "Timeline",
	titles: "Titles",
	captions: "Captions",
	effects: "Effects",
	transitions: "Transitions",
} as const;
export type DockPanel = keyof typeof PANEL_NAMES;
export type DockZone = "center" | "left" | "right" | "top" | "bottom";
export type DockGroup = {
	type: "group";
	id: string;
	tabs: DockPanel[];
	active: DockPanel;
};
export type DockNode =
	| DockGroup
	| {
			type: "split";
			id: string;
			direction: "horizontal" | "vertical";
			ratio: number;
			first: DockNode;
			second: DockNode;
	  };
export type FloatingGroup = DockGroup & {
	x: number;
	y: number;
	width: number;
	height: number;
};
export type DockLayout = { root: DockNode; floating: FloatingGroup[] };
const id = () => crypto.randomUUID();
const group = ({
	tabs,
	name,
}: {
	tabs: DockPanel[];
	name?: string;
}): DockGroup => ({ type: "group", id: name ?? id(), tabs, active: tabs[0] });
const split = ({
	first,
	second,
	direction = "horizontal",
	ratio = 50,
}: {
	first: DockNode;
	second: DockNode;
	direction?: "horizontal" | "vertical";
	ratio?: number;
}): DockNode => ({ type: "split", id: id(), first, second, direction, ratio });
export function defaultLayout({
	preset = "Editing",
}: {
	preset?: string;
} = {}): DockLayout {
	const tools: DockPanel[] = [
		"assets",
		"titles",
		"captions",
		"effects",
		"transitions",
	];
	if (preset === "Captions")
		tools.splice(
			0,
			tools.length,
			"captions",
			"titles",
			"assets",
			"effects",
			"transitions",
		);
	if (preset === "Effects")
		tools.splice(
			0,
			tools.length,
			"effects",
			"transitions",
			"assets",
			"titles",
			"captions",
		);
	const center = split({
		first: group({ tabs: ["preview"] }),
		second: group({ tabs: ["properties"] }),
		ratio: 70,
	});
	return {
		root: split({
			first: split({
				first: group({ tabs: tools }),
				second: center,
				ratio: preset === "Captions" ? 34 : 25,
			}),
			second: group({ tabs: ["timeline"] }),
			direction: "vertical",
			ratio: preset === "Timeline" ? 42 : 66,
		}),
		floating: [],
	};
}
export function groups({ node }: { node: DockNode }): DockGroup[] {
	return node.type === "group"
		? [node]
		: [...groups({ node: node.first }), ...groups({ node: node.second })];
}
export function allGroups({ layout }: { layout: DockLayout }): DockGroup[] {
	return [...groups({ node: layout.root }), ...layout.floating];
}
export function mapNode({
	node,
	update,
}: {
	node: DockNode;
	update: (node: DockNode) => DockNode;
}): DockNode {
	return update(
		node.type === "group"
			? node
			: {
					...node,
					first: mapNode({ node: node.first, update }),
					second: mapNode({ node: node.second, update }),
				},
	);
}
function remove({
	node,
	panel,
}: {
	node: DockNode;
	panel: DockPanel;
}): DockNode | null {
	if (node.type === "group") {
		if (!node.tabs.includes(panel)) return node;
		const tabs = node.tabs.filter((p) => p !== panel);
		return tabs.length
			? {
					...node,
					tabs,
					active: tabs.includes(node.active) ? node.active : tabs[0],
				}
			: null;
	}
	const first = remove({ node: node.first, panel }),
		second = remove({ node: node.second, panel });
	return first && second ? { ...node, first, second } : (first ?? second);
}
export function closePanel({
	layout,
	panel,
}: {
	layout: DockLayout;
	panel: DockPanel;
}): DockLayout {
	if (!allGroups({ layout }).some((g) => g.tabs.includes(panel))) return layout;
	return {
		root: remove({ node: layout.root, panel }) ?? {
			...group({ tabs: [] }),
			active: "assets",
		},
		floating: layout.floating.flatMap((g) => {
			const next = remove({ node: g, panel });
			return next?.type === "group" ? [{ ...g, ...next }] : [];
		}),
	};
}
export function movePanel({
	layout,
	panel,
	target,
	zone = "center",
	index,
}: {
	layout: DockLayout;
	panel: DockPanel;
	target: string;
	zone?: DockZone;
	index?: number;
}): DockLayout {
	const destination = allGroups({ layout }).find((g) => g.id === target);
	if (
		!destination ||
		(destination.tabs.length === 1 && destination.tabs[0] === panel)
	)
		return layout;
	// Preserve the destination ID when moving its last tab within that group.
	const next = closePanel({ layout, panel });
	const insert = (node: DockNode): DockNode => {
		if (node.id !== target || node.type !== "group") return node;
		if (zone === "center") {
			const tabs = [...node.tabs];
			tabs.splice(index ?? tabs.length, 0, panel);
			return { ...node, tabs, active: panel };
		}
		const added = group({ tabs: [panel] });
		return split({
			first: zone === "left" || zone === "top" ? added : node,
			second: zone === "left" || zone === "top" ? node : added,
			direction:
				zone === "left" || zone === "right" ? "horizontal" : "vertical",
		});
	};
	if (layout.floating.some((g) => g.id === target) && zone !== "center")
		return layout;
	return {
		root: mapNode({ node: next.root, update: insert }),
		floating: next.floating.map(
			(g) => ({ ...g, ...insert(g) }) as FloatingGroup,
		),
	};
}
export function floatPanel({
	layout,
	panel,
}: {
	layout: DockLayout;
	panel: DockPanel;
}): DockLayout {
	const next = closePanel({ layout, panel });
	return {
		...next,
		floating: [
			...next.floating,
			{ ...group({ tabs: [panel] }), x: 18, y: 10, width: 44, height: 65 },
		],
	};
}
export function activatePanel({
	layout,
	panel,
}: {
	layout: DockLayout;
	panel: DockPanel;
}): DockLayout {
	const found = allGroups({ layout }).find((g) => g.tabs.includes(panel));
	if (!found)
		return movePanel({
			layout,
			panel,
			target: groups({ node: layout.root })[0].id,
		});
	return {
		root: mapNode({
			node: layout.root,
			update: (n) =>
				n.id === found.id && n.type === "group" ? { ...n, active: panel } : n,
		}),
		floating: layout.floating.map((g) =>
			g.id === found.id ? { ...g, active: panel } : g,
		),
	};
}
export function isValidLayout(value: unknown): value is DockLayout {
	const seen = new Set<string>(),
		ids = new Set<string>();
	let count = 0;
	const valid = (n: unknown): boolean => {
		if (!n || typeof n !== "object" || ++count > 40) return false;
		const v = n as DockNode;
		if (typeof v.id !== "string" || ids.has(v.id)) return false;
		ids.add(v.id);
		if (v.type === "split")
			return (
				["horizontal", "vertical"].includes(v.direction) &&
				Number.isFinite(v.ratio) &&
				v.ratio >= 10 &&
				v.ratio <= 90 &&
				valid(v.first) &&
				valid(v.second)
			);
		if (
			v.type !== "group" ||
			!Array.isArray(v.tabs) ||
			(v.tabs.length > 0 && !v.tabs.includes(v.active))
		)
			return false;
		return v.tabs.every((p) => {
			if (!Object.hasOwn(PANEL_NAMES, p) || seen.has(p)) return false;
			seen.add(p);
			return true;
		});
	};
	const layout = value as DockLayout;
	return (
		!!layout &&
		valid(layout.root) &&
		Array.isArray(layout.floating) &&
		layout.floating.every(
			(g) =>
				valid(g) &&
				[g.x, g.y, g.width, g.height].every(Number.isFinite) &&
				g.width > 0 &&
				g.width <= 100 &&
				g.height > 0 &&
				g.height <= 100 &&
				g.x >= 0 &&
				g.y >= 0 &&
				g.x + g.width <= 100.01 &&
				g.y + g.height <= 100.01,
		)
	);
}
