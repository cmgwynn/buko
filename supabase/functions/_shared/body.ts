export class BodyError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function boundedJson(request: Request, limit: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError('Send a JSON request.', 400);
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new BodyError('Request too large.', 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); }
    catch { throw new BodyError('Send valid JSON.', 400); }
  } finally { reader.releaseLock(); }
}
