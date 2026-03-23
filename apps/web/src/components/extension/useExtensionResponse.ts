/**
 * Hook for sending extension UI dialog responses back to Pi.
 *
 * Provides typed response functions (submit value, confirm, cancel)
 * and clears the pending dialog from the store after sending.
 */

import { useStore } from "@/store";
import { getTransport } from "@/wireTransport";
import { useCallback } from "react";

/**
 * Returns response handlers for the current pending extension dialog.
 */
export function useExtensionResponse() {
	const clearPendingExtensionUi = useStore((s) => s.clearPendingExtensionUi);
	const setLastError = useStore((s) => s.setLastError);

	/** Send a value response (for select, input, editor). */
	const submitValue = useCallback(
		async (requestId: string, value: string) => {
			try {
				await getTransport().request("session.extensionUiResponse", {
					id: requestId,
					value,
				});
			} catch (err) {
				setLastError(
					`Extension response failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				clearPendingExtensionUi();
			}
		},
		[clearPendingExtensionUi, setLastError],
	);

	/** Send a confirmation response (for confirm dialogs). */
	const submitConfirm = useCallback(
		async (requestId: string, confirmed: boolean) => {
			try {
				await getTransport().request("session.extensionUiResponse", {
					id: requestId,
					confirmed,
				});
			} catch (err) {
				setLastError(
					`Extension response failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				clearPendingExtensionUi();
			}
		},
		[clearPendingExtensionUi, setLastError],
	);

	/** Cancel the dialog (works for all dialog types). */
	const cancel = useCallback(
		async (requestId: string) => {
			try {
				await getTransport().request("session.extensionUiResponse", {
					id: requestId,
					cancelled: true,
				});
			} catch (err) {
				setLastError(
					`Extension cancel failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				clearPendingExtensionUi();
			}
		},
		[clearPendingExtensionUi, setLastError],
	);

	return { submitValue, submitConfirm, cancel };
}
