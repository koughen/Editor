"use client";

import { Separator } from "@/components/ui/separator";
import { useAssetsPanelStore } from "./assets-panel-store";
import { TabBar } from "./tabbar";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/sounds/components/assets-view";
import { StickersView } from "@/stickers/components/assets-view";

export function AssetsPanel() {
	const { activeTab } = useAssetsPanelStore();
	// Editing tools live in their own dock panels. This rail only navigates
	// project assets, including when a legacy command opens a tool panel.
	const viewMap = {
		media: <MediaView />,
		sounds: <SoundsView />,
		stickers: <StickersView />,
		settings: <SettingsView />,
	};
	const projectTab = Object.hasOwn(viewMap, activeTab)
		? (activeTab as keyof typeof viewMap)
		: "media";
	return (
		<div className="panel bg-background flex h-full rounded-sm border overflow-hidden">
			<TabBar activeTab={projectTab} />
			<Separator orientation="vertical" />
			<div className="flex-1 overflow-hidden">{viewMap[projectTab]}</div>
		</div>
	);
}
