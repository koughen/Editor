import type { TimelineElement } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import { useWorkspaceStore } from "@/workspace/store";
import { activatePanel } from "@/workspace/layout";
import { TICKS_PER_SECOND } from "@/wasm";
import { TRANSITIONS, TRANSITION_TYPE } from "../definition";
export function TransitionIndicators({
	element,
	trackId,
	height,
}: {
	element: TimelineElement;
	trackId: string;
	height: number;
}) {
	const editor = useEditor();
	const transition =
		"effects" in element
			? element.effects?.find((e) => e.type === TRANSITION_TYPE && e.enabled)
			: undefined;
	if (!transition || element.duration <= 0) return null;
	return (
		<div
			style={{
				position: "absolute",
				inset: "0 0 auto",
				height,
				pointerEvents: "none",
				overflow: "hidden",
			}}
		>
			{(["in", "out"] as const).map((edge) => {
				const mode = Number(transition.params[`${edge}Mode`] ?? 0),
					duration = Number(transition.params[`${edge}Duration`] ?? 0);
				if (!mode || duration <= 0) return null;
				const name =
					TRANSITIONS.find((t) => t.id === mode)?.name ?? "Transition";
				return (
					<button
						key={edge}
						type="button"
						aria-label={`${edge === "in" ? "Entrance" : "Exit"}: ${name} on ${element.name}`}
						title={`${name} · ${duration.toFixed(2)}s (limited to half the clip)`}
						style={{
							position: "absolute",
							bottom: 2,
							[edge === "in" ? "left" : "right"]: 2,
							width: `${Math.min(50, ((duration * TICKS_PER_SECOND) / element.duration) * 100)}%`,
							minWidth: 8,
							height: 12,
							pointerEvents: "auto",
							background: "#ffd60088",
							border: "1px solid #ffd600bb",
							borderRadius: 2,
							color: "#111",
							fontSize: 8,
							overflow: "hidden",
							whiteSpace: "nowrap",
						}}
						onMouseDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation();
							editor.selection.setSelectedElements({
								elements: [{ trackId, elementId: element.id }],
							});
							const state = useWorkspaceStore.getState();
							state.setLayout(
								activatePanel({ layout: state.layout, panel: "transitions" }),
							);
						}}
					>
						{edge === "in" ? "◢" : "◣"} {name}
					</button>
				);
			})}
		</div>
	);
}
