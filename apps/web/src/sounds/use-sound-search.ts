import { useEffect } from "react";
import { useSoundsStore } from "@/sounds/sounds-store";

// Desktop build: remote sound-effects search is disabled until the local
// extraction tool is integrated. The hook keeps its shape so the UI stays
// mounted and the saved-sounds panel continues to work.
export function useSoundSearch(_args: { query: string; commercialOnly: boolean }) {
	const { searchResults, setSearchResults, setSearching, setSearchError } =
		useSoundsStore();

	useEffect(() => {
		setSearchResults({ results: [] });
		setSearching({ searching: false });
		setSearchError({ error: null });
	}, [setSearchResults, setSearching, setSearchError]);

	return {
		results: searchResults,
		isLoading: false,
		error: null as string | null,
		loadMore: async () => {},
		hasNextPage: false,
		isLoadingMore: false,
		totalCount: 0,
	};
}
