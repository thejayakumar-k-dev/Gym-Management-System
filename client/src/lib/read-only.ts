import { createContext, useContext } from "react";

/**
 * Admin "open the vendor panel" safety switch — Read Only vs Edit.
 *
 * Two halves that are always set together by App.tsx:
 *
 * - `ReadOnlyContext` is what pages read so they can disable their
 *   Add / Edit / Delete buttons while an admin is only looking.
 * - The module flag is what `apiRequest` checks, so every write path —
 *   including a button we forget to disable — is still blocked before it
 *   reaches the API.
 *
 * The flag defaults to `false` (Edit) and is only ever turned on for an
 * admin impersonating a vendor; vendors logging in normally are unaffected.
 */

let readOnlyActive = false;

export function setReadOnlyMode(active: boolean) {
  readOnlyActive = active;
}

export function isReadOnlyMode() {
  return readOnlyActive;
}

export const ReadOnlyContext = createContext(false);

export function useReadOnly() {
  return useContext(ReadOnlyContext);
}
