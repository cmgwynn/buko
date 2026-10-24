import { AccountError } from './errors.ts';

export async function readPhoto(response: Response, maxBytes: number): Promise<{ base64: string; contentType: string; byteLength: number }> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new AccountError('A private recipe photo could not be downloaded. No partial export was returned. Retry or contact the app operator.', 503, 'PHOTO_DOWNLOAD_FAILED');
  }
  const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (!contentType || !/^image\/[a-z0-9.+-]+$/.test(contentType)) {
    await response.body.cancel();
    throw new AccountError('A private recipe photo has an invalid image content type. No partial export was returned.', 503, 'PHOTO_DOWNLOAD_FAILED');
  }
  const tooLarge = () => new AccountError('A recipe photo exceeds the 5 MiB per-image or remaining 20 MiB JSON export budget. No partial export was returned. Contact the app operator for a complete assisted export.', 413, 'EXPORT_TOO_LARGE');
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body.cancel();
    throw tooLarge();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) { await reader.cancel(); throw tooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (response.headers.has('Content-Length') && Number.isFinite(length) && length !== byteLength) {
    throw new AccountError('A private recipe photo download was incomplete. No partial export was returned.', 503, 'PHOTO_DOWNLOAD_FAILED');
  }
  if (byteLength === 0) throw new AccountError('A private recipe photo was empty. No partial export was returned.', 503, 'PHOTO_DOWNLOAD_FAILED');
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  // Small chunks avoid argument-stack overflow; btoa is supported in Deno and Node.
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += 32768) {
    parts.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
  }
  return { base64: btoa(parts.join('')), contentType, byteLength };
}
