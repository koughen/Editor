import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultLayout, isValidLayout, type DockLayout } from "./layout";
type SavedLayout = { name: string; layout: DockLayout };
type WorkspaceState = {
	layout: DockLayout;
	saved: SavedLayout[];
	maximized: string | null;
	setLayout: (layout: DockLayout) => void;
	maximize: (id: string | null) => void;
	preset: (name: string) => void;
	save: (name: string) => void;
	load: (name: string) => void;
};
export const useWorkspaceStore = create<WorkspaceState>()(
	persist(
		(set, get) => ({
			layout: defaultLayout(),
			saved: [],
			maximized: null,
			setLayout: (layout) => set({ layout, maximized: null }),
			maximize: (id) => set({ maximized: get().maximized === id ? null : id }),
			preset: (name) =>
				set({ layout: defaultLayout({ preset: name }), maximized: null }),
			save: (name) => {
				const title = name.trim().slice(0, 60);
				if (title)
					set({
						saved: [
							...get().saved.filter((s) => s.name !== title),
							{ name: title, layout: structuredClone(get().layout) },
						].slice(-12),
					});
			},
			load: (name) => {
				const saved = get().saved.find((s) => s.name === name);
				if (saved)
					set({ layout: structuredClone(saved.layout), maximized: null });
			},
		}),
		{
			name: "editor-edit-workspace",
			version: 1,
			partialize: ({ layout, saved }) => ({ layout, saved }),
			merge: (stored, current) => {
				const state = stored as Partial<WorkspaceState> | undefined;
				return {
					...current,
					layout: isValidLayout(state?.layout) ? state.layout : current.layout,
					saved: (Array.isArray(state?.saved) ? state.saved : [])
						.filter(
							(s) => typeof s.name === "string" && isValidLayout(s.layout),
						)
						.slice(-12),
				};
			},
		},
	),
);
