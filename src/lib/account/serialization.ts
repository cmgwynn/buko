export function serializeAccountExport(data: unknown): string {
  const json = JSON.stringify(data);
  if (typeof json !== 'string') throw new Error('The account export is invalid. No file was saved.');
  if (new TextEncoder().encode(json).byteLength > 20 * 1024 * 1024) {
    throw new Error('The complete archive, including photos and this device’s unsaved data, exceeds 20 MiB. No partial file was saved. Contact the app operator for a complete assisted export.');
  }
  return json;
}
