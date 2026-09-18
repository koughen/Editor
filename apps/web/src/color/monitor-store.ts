import { create } from "zustand";
import type { SceneTracks } from "@/timeline";

type ColorMonitor = {
	elementId: string | null;
	nodeId: string | null;
	bypass: boolean;
	matte: boolean;
};
const initial: ColorMonitor = {
	elementId: null,
	nodeId: null,
	bypass: false,
	matte: false,
};
export const useColorMonitorStore = create<ColorMonitor>(() => initial);
export function resetColorMonitor() {
	useColorMonitorStore.setState(initial);
}

// Only the interactive preview calls this adapter. Export always builds its
// render tree from saved tracks, so monitor controls cannot affect delivery.
export function colorMonitorTracks({
	tracks,
	monitor,
}: {
	tracks: SceneTracks;
	monitor: ColorMonitor;
}): SceneTracks {
	if (!monitor.bypass && !monitor.matte) return tracks;
	const decorate = <
		T extends SceneTracks["main"] | SceneTracks["overlay"][number],
	>(
		track: T,
	): T => ({
		...track,
		elements: track.elements.map((element) => {
			if (element.type !== "video" && element.type !== "image") return element;
			const effects = element.effects ?? [];
			if (monitor.bypass)
				return {
					...element,
					effects: effects.map((effect) =>
						effect.type === "color-grade"
							? { ...effect, enabled: false }
							: effect,
					),
				};
			if (element.id !== monitor.elementId) return element;
			const index = effects.findIndex((effect) => effect.id === monitor.nodeId);
			if (index < 0) return element;
			return {
				...element,
				effects: effects.slice(0, index + 1).map((effect, i) =>
					i === index
						? {
								...effect,
								enabled: true,
								params: { ...effect.params, monitorMatte: 1 },
							}
						: effect,
				),
			};
		}),
	});
	return {
		...tracks,
		main: decorate(tracks.main),
		overlay: tracks.overlay.map(decorate),
	};
}
