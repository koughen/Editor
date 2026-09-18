"use client";
import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import {
	audioDesktop,
	type NativePlugin,
	type PluginParameter,
} from "../native";
import type { AudioMixSettings } from "../types";
import { AudioControl } from "./audio-control";
export function NativePlugins({
	settings: s,
	onChange,
	onCommit,
}: {
	settings: AudioMixSettings;
	onChange: (p: Partial<AudioMixSettings>) => void;
	onCommit: () => void;
}) {
	const editor = useEditor();
	const [available, setAvailable] = useState<NativePlugin[]>([]);
	const [parameters, setParameters] = useState<
		Record<string, PluginParameter[]>
	>({});
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState("");
	const invoke = audioDesktop();
	const run = async (fn: () => Promise<void>) => {
		setBusy(true);
		setStatus("");
		try {
			await fn();
		} catch (e) {
			setStatus(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	const load = async (id: string) => {
		if (!invoke) return [];
		const p = await invoke<PluginParameter[]>("audio_plugins", { id });
		setParameters((v) => ({ ...v, [id]: p }));
		return p;
	};
	return (
		<details className="audio-advanced-section">
			<summary>
				<span>Audio Unit inserts</span>
				<small>{s.plugins.length}/8</small>
			</summary>
			<p className="audio-effect-hint">
				macOS effects with saved parameter controls. Track inserts run before
				built-in effects; stereo-out inserts run after the mix. Render a preview
				after edits, then press Play.
			</p>
			{!invoke && (
				<p className="audio-effect-hint">
					Open the macOS app to load Audio Units. Existing plug-ins must be
					bypassed to export in a browser.
				</p>
			)}
			<button
				className="audio-wide-button"
				type="button"
				disabled={!invoke || busy}
				onClick={() =>
					void run(async () => {
						setAvailable(
							invoke
								? await invoke<NativePlugin[]>("audio_plugins", { id: null })
								: [],
						);
					})
				}
			>
				{busy ? "Working…" : "Scan installed effects"}
			</button>
			{available.length > 0 && (
				<select
					aria-label="Add Audio Unit"
					value=""
					disabled={busy || s.plugins.length >= 8}
					onChange={(e) => {
						const id = e.target.value;
						void run(async () => {
							const p = await load(id);
							onChange({
								plugins: [
									...s.plugins,
									{
										id,
										name: available.find((v) => v.id === id)?.name ?? id,
										instanceId: crypto.randomUUID(),
										parameters: Object.fromEntries(
											p.map((v) => [v.id, v.value]),
										),
										bypass: false,
									},
								],
							});
							onCommit();
						});
					}}
				>
					<option value="">Add Audio Unit…</option>
					{available.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name} · {p.manufacturer}
						</option>
					))}
				</select>
			)}
			{s.plugins.map((plugin, i) => (
				<details
					className="audio-plugin"
					key={plugin.instanceId}
					onToggle={(e) => {
						if (e.currentTarget.open && !parameters[plugin.id] && invoke)
							void run(async () => {
								await load(plugin.id);
							});
					}}
				>
					<summary>
						{i + 1}. {plugin.name}
						{plugin.bypass ? " · bypassed" : ""}
					</summary>
					<div className="audio-order-row">
						<label className="audio-toggle">
							<input
								type="checkbox"
								checked={plugin.bypass}
								onChange={(e) => {
									onChange({
										plugins: s.plugins.map((p, j) =>
											i === j ? { ...p, bypass: e.target.checked } : p,
										),
									});
									onCommit();
								}}
							/>
							Bypass
						</label>
						<button
							type="button"
							disabled={i === 0}
							aria-label={`Move ${plugin.name} up`}
							onClick={() => {
								const p = [...s.plugins];
								[p[i - 1], p[i]] = [p[i], p[i - 1]];
								onChange({ plugins: p });
								onCommit();
							}}
						>
							↑
						</button>
						<button
							type="button"
							aria-label={`Remove ${plugin.name}`}
							onClick={() => {
								onChange({ plugins: s.plugins.filter((_, j) => i !== j) });
								onCommit();
							}}
						>
							×
						</button>
					</div>
					{parameters[plugin.id]?.map((p) => (
						<AudioControl
							key={p.id}
							label={p.name}
							value={plugin.parameters[p.id] ?? p.value}
							min={p.min}
							max={p.max}
							step={
								p.values.length ? 1 : Math.max(0.001, (p.max - p.min) / 1000)
							}
							unit={p.unit}
							disabled={plugin.bypass}
							onChange={(v) =>
								onChange({
									plugins: s.plugins.map((a, j) =>
										i === j
											? { ...a, parameters: { ...a.parameters, [p.id]: v } }
											: a,
									),
								})
							}
							onCommit={onCommit}
						/>
					))}
				</details>
			))}
			{s.plugins.length > 0 && (
				<button
					className="audio-wide-button"
					type="button"
					disabled={busy || !invoke}
					onClick={() =>
						void run(async () => {
							await editor.audio.preparePluginPreview();
							setStatus(
								"Preview is ready. Press Play. Any mix edit requires a new preview.",
							);
						})
					}
				>
					Render plug-in preview
				</button>
			)}
			{status && (
				<p className="audio-effect-hint" role="status">
					{status}
				</p>
			)}
		</details>
	);
}
