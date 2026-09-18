"use client";
import type { TextElement } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import {
	Section,
	SectionHeader,
	SectionTitle,
	SectionContent,
} from "@/components/section";
export function AppearanceSection({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const editor = useEditor();
	const stroke = element.stroke ?? { color: "#000000", width: 0 };
	const shadow = element.shadow ?? {
		color: "#000000",
		blur: 0,
		offsetX: 0,
		offsetY: 0,
	};
	const update = ({ patch }: { patch: Partial<TextElement> }) =>
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch }],
		});
	return (
		<Section collapsible sectionKey={`${element.id}:appearance`}>
			<SectionHeader>
				<SectionTitle>Outline & shadow</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<div className="edit-tools text-appearance">
					<div className="edit-inline">
						<label>
							Outline color
							<input
								aria-label="Outline color"
								type="color"
								value={stroke.color}
								onChange={(e) =>
									update({
										patch: { stroke: { ...stroke, color: e.target.value } },
									})
								}
							/>
						</label>
						<label>
							Width
							<input
								key={`${element.id}:stroke:${stroke.width}`}
								aria-label="Outline width"
								type="number"
								min="0"
								max="30"
								step="0.5"
								defaultValue={stroke.width}
								onBlur={(e) =>
									update({
										patch: {
											stroke: {
												...stroke,
												width: Math.max(
													0,
													Math.min(30, Number(e.target.value) || 0),
												),
											},
										},
									})
								}
							/>
						</label>
					</div>
					<label>
						Shadow color
						<input
							aria-label="Shadow color"
							type="color"
							value={shadow.color}
							onChange={(e) =>
								update({
									patch: { shadow: { ...shadow, color: e.target.value } },
								})
							}
						/>
					</label>
					<div className="edit-inline">
						{(
							[
								["blur", "Blur", 0, 100],
								["offsetX", "X offset", -100, 100],
								["offsetY", "Y offset", -100, 100],
							] as const
						).map(([key, label, min, max]) => (
							<label key={key}>
								{label}
								<input
									key={`${element.id}:${key}:${shadow[key]}`}
									aria-label={`Shadow ${label}`}
									type="number"
									min={min}
									max={max}
									defaultValue={shadow[key]}
									onBlur={(e) =>
										update({
											patch: {
												shadow: {
													...shadow,
													[key]: Math.max(
														min,
														Math.min(max, Number(e.target.value) || 0),
													),
												},
											},
										})
									}
								/>
							</label>
						))}
					</div>
					<button
						type="button"
						onClick={() =>
							update({
								patch: {
									stroke: { ...stroke, width: 0 },
									shadow: { ...shadow, blur: 0, offsetX: 0, offsetY: 0 },
								},
							})
						}
					>
						Reset outline & shadow
					</button>
					<p className="edit-help">
						Sizes are pixels at 1080p and scale with your canvas.
					</p>
				</div>
			</SectionContent>
		</Section>
	);
}
