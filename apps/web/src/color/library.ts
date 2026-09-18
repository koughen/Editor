import type { Effect } from "@/effects/types";
export type ColorStill = {
	id: string;
	name: string;
	image: string;
	grades: Effect[];
	createdAt: number;
};
function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("editor-color-library", 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore("stills", { keyPath: "id" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
export async function listStills(): Promise<ColorStill[]> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("stills", "readonly");
		const request = tx.objectStore("stills").getAll();
		request.onsuccess = () =>
			resolve(
				(request.result as ColorStill[]).sort(
					(a, b) => b.createdAt - a.createdAt,
				),
			);
		request.onerror = () => reject(request.error);
		tx.oncomplete = () => db.close();
	});
}
export async function saveStill({
	still,
}: {
	still: ColorStill;
}): Promise<void> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("stills", "readwrite");
		tx.objectStore("stills").put(still);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}
export async function removeStill({ id }: { id: string }): Promise<void> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("stills", "readwrite");
		tx.objectStore("stills").delete(id);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
	});
}
