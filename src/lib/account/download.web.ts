import { serializeAccountExport } from './serialization';

export async function saveAccountExport(data: unknown): Promise<string> {
  const blob = new Blob([serializeAccountExport(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `buko-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return 'Download requested. Check your browser downloads. Saved private recipe photos are embedded in the JSON archive and do not expire.';
}

export async function removeAccountExportCache(_userId: string): Promise<void> {
  // Browser-managed downloads cannot be erased by this application.
}
