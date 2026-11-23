/** True when running as the standalone, server-less preview page (see scripts/build-preview.mjs). */
export function isPreview(): boolean {
  return typeof window !== "undefined" && (window as { __UC_PREVIEW__?: boolean }).__UC_PREVIEW__ === true;
}
