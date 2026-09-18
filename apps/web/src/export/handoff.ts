import { buildProjectHandoff, safeExportFileName } from "opencut-wasm";
import { Zip, ZipPassThrough } from "fflate";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import type { TScene } from "@/timeline";

export type HandoffTarget = "premiere" | "resolve" | "after-effects" | "capcut";
export type HandoffMode = "editable" | "appearance";
export interface HandoffPlan {
	name: string;
	target: HandoffTarget;
	mode: HandoffMode;
	duration: number;
	warnings: string[];
	needsRender: boolean;
	requiredMediaIds: string[];
	files: { path: string; content: string }[];
}
interface PackageAsset {
	id: string;
	name: string;
	path: string;
	width: number;
	height: number;
	duration: number;
	fps: number;
	hasAudio: boolean;
	file?: File;
	url?: string;
}
function packageAssets({
	media,
	scene,
}: {
	media: MediaAsset[];
	scene: TScene;
}): PackageAsset[] {
	const assets: PackageAsset[] = media.map((a, i) => ({
		id: a.id,
		name: a.file.name,
		path: `media/${i}-${safeExportFileName(a.file.name)}`,
		width: a.width ?? 0,
		height: a.height ?? 0,
		duration: a.duration ?? 0,
		fps: a.fps ?? 0,
		hasAudio: a.hasAudio ?? a.type === "audio",
		file: a.file,
	}));
	for (const track of [
		...scene.tracks.overlay,
		scene.tracks.main,
		...scene.tracks.audio,
	]) {
		for (const element of track.elements) {
			if (element.type === "audio" && element.sourceType === "library") {
				assets.push({
					id: `library-${element.id}`,
					name: element.name,
					path: `media/library-${assets.length}.mp3`,
					width: 0,
					height: 0,
					duration: 0,
					fps: 0,
					hasAudio: true,
					url: element.sourceUrl,
				});
			}
		}
	}
	return assets;
}
export function planHandoff({
	project,
	scene,
	media,
	target,
	mode,
}: {
	project: TProject;
	scene: TScene;
	media: MediaAsset[];
	target: HandoffTarget;
	mode: HandoffMode;
}): HandoffPlan {
	return JSON.parse(
		buildProjectHandoff(
			JSON.stringify({
				project,
				scene,
				media: packageAssets({ media, scene }).map(
					({ file: _file, url: _url, ...a }) => a,
				),
				target,
				mode,
			}),
		),
	);
}

type Invoke = <T>(
	command: string,
	args?: Record<string, unknown>,
) => Promise<T>;
function desktopInvoke(): Invoke | undefined {
	return (window as Window & { __TAURI_INTERNALS__?: { invoke: Invoke } })
		.__TAURI_INTERNALS__?.invoke;
}
export function canOpenHandoff(): boolean {
	return typeof window !== "undefined" && !!desktopInvoke();
}

async function downloadPackage({
	entries,
	filename,
	signal,
}: {
	entries: { path: string; blob: Blob }[];
	filename: string;
	signal: AbortSignal;
}): Promise<void> {
	// This ZIP writer uses 32-bit offsets. Reject oversized packages instead of
	// emitting an archive that destination applications cannot extract.
	if (
		entries.reduce(
			(total, entry) => total + entry.blob.size + entry.path.length * 4 + 256,
			0,
		) >= 0xffffffff
	) {
		throw new Error(
			"This package exceeds the ZIP format's 4 GB limit. Use the desktop folder handoff, or omit original media in Preserve appearance mode.",
		);
	}
	// Store compressed media without recompressing it. Stream each source file into ZIP.
	const parts: Uint8Array<ArrayBuffer>[] = [];
	let zipError: Error | null = null;
	const archive = new Zip((error, data) => {
		if (error) zipError = error;
		else parts.push(new Uint8Array(data));
	});
	const abort = () => archive.terminate();
	signal.addEventListener("abort", abort, { once: true });
	try {
		for (const entry of entries) {
			signal.throwIfAborted();
			const file = new ZipPassThrough(entry.path);
			archive.add(file);
			const reader = entry.blob.stream().getReader();
			try {
				while (true) {
					signal.throwIfAborted();
					const { value, done } = await reader.read();
					if (done) break;
					file.push(value, false);
					if (zipError) throw zipError;
				}
				file.push(new Uint8Array(), true);
			} finally {
				await reader.cancel();
				reader.releaseLock();
			}
		}
		archive.end();
		signal.throwIfAborted();
		if (zipError) throw zipError;
		const url = URL.createObjectURL(
			new Blob(parts, { type: "application/zip" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	} finally {
		signal.removeEventListener("abort", abort);
		archive.terminate();
	}
}

export async function exportHandoff({
	editor,
	plan,
	includeSources,
	openApp,
	signal,
	onProgress,
}: {
	editor: EditorCore;
	plan: HandoffPlan;
	includeSources: boolean;
	openApp: boolean;
	signal: AbortSignal;
	onProgress: (state: { progress: number; message: string }) => void;
}): Promise<string> {
	const scene = editor.scenes.getActiveScene();
	const assets = packageAssets({ media: editor.media.getAssets(), scene });
	const entries = plan.files.map((file) => ({
		path: file.path,
		blob: new Blob([file.content], { type: "text/plain" }),
	}));
	if (plan.needsRender) {
		onProgress({ progress: 0, message: "Rendering the timeline appearance…" });
		const cancel = () => editor.project.cancelExport();
		signal.addEventListener("abort", cancel, { once: true });
		try {
			signal.throwIfAborted();
			const result = await editor.project.export({
				options: {
					format: "mp4",
					codec: "avc",
					quality: "very_high",
					includeAudio: true,
					audioBitrate: 320000,
					audioSampleRate: 48000,
				},
			});
			signal.throwIfAborted();
			if (!result.success || !result.buffer)
				throw new Error(result.error ?? "Rendering was cancelled.");
			entries.push({
				path: "media/Rendered timeline.mp4",
				blob: new Blob([result.buffer], { type: "video/mp4" }),
			});
		} finally {
			signal.removeEventListener("abort", cancel);
			editor.project.clearExportState();
		}
	}
	if (includeSources || plan.mode === "editable") {
		const required = assets.filter((a) => plan.requiredMediaIds.includes(a.id));
		for (let i = 0; i < required.length; i++) {
			signal.throwIfAborted();
			const asset = required[i];
			onProgress({
				progress: 0.65 + (i / required.length) * 0.2,
				message: `Collecting ${asset.name}…`,
			});
			let blob: Blob;
			if (asset.file) blob = asset.file;
			else if (asset.url) {
				const response = await fetch(asset.url, { signal });
				if (!response.ok)
					throw new Error(
						`Could not download ${asset.name}. Try again when the source is available.`,
					);
				blob = await response.blob();
			} else throw new Error(`Missing media: ${asset.name}`);
			entries.push({ path: asset.path, blob });
		}
	}
	signal.throwIfAborted();
	onProgress({
		progress: 0.9,
		message: openApp
			? "Saving the handoff folder…"
			: "Packaging timeline and media…",
	});
	const invoke = desktopInvoke();
	if (openApp && invoke) {
		const ticket = await invoke<string>("begin_handoff", { name: plan.name });
		try {
			for (const entry of entries) {
				for (
					let offset = 0;
					offset < Math.max(1, entry.blob.size);
					offset += 524288
				) {
					signal.throwIfAborted();
					const bytes = new Uint8Array(
						await entry.blob.slice(offset, offset + 524288).arrayBuffer(),
					);
					await invoke("write_handoff_file", {
						ticket,
						path: entry.path,
						offset,
						bytes: Array.from(bytes),
					});
				}
			}
			signal.throwIfAborted();
			return await invoke<string>("finish_handoff", {
				ticket,
				target: plan.target,
			});
		} catch (error) {
			await invoke("cancel_handoff", { ticket }).catch(() => {});
			throw error;
		}
	}
	await downloadPackage({
		entries,
		filename: `${plan.name}-${plan.target}.zip`,
		signal,
	});
	return `Saved ${plan.name}-${plan.target}.zip. Extract the folder and follow README.txt to import the timeline.`;
}
