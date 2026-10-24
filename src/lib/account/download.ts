import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { serializeAccountExport } from './serialization';

/** The cache file is removed after the share sheet closes; saved/shared copies belong to the user. */
export async function saveAccountExport(data: unknown): Promise<string> {
  const json = serializeAccountExport(data);
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device. Use the web app to download your complete export.');
  const userId = (data as { account?: { id?: unknown } } | null)?.account?.id;
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('The export account is invalid. No file was saved.');
  const directory = new Directory(Paths.cache, `buko-account-${userId}`);
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, `buko-export-${Date.now()}.json`);
  try {
    file.create();
    file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your Buko data' });
    return 'Share sheet closed. If you did not save or share the file, export again. Saved private recipe photos are embedded in the JSON archive and do not expire.';
  } finally {
    if (file.exists) file.delete();
  }
}

export async function removeAccountExportCache(userId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid export cache owner.');
  const directory = new Directory(Paths.cache, `buko-account-${userId}`);
  if (directory.exists) directory.delete();
}
