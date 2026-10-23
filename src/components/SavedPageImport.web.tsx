import { useRef, useState } from 'react';
import { MAX_RECIPE_BYTES } from '../lib/recipes/importer';
import type { SavedPageImportProps } from './SavedPageImport';
import { Button } from './ui';

export function SavedPageImport({ disabled, onLoad, onError }: SavedPageImportProps) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function readFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      if (file.size > MAX_RECIPE_BYTES) throw new Error('That file is too large to import (maximum 3 MB).');
      onLoad(await file.text());
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not read that file. Try saving the page again.');
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <input ref={input} type="file" accept=".html,.htm,text/html" aria-label="Saved recipe HTML file"
        style={{ display: 'none' }} disabled={disabled || reading} onChange={(event) => { void readFile(event.target.files?.[0]); }} />
      <Button title="Choose saved HTML page" variant="secondary" disabled={disabled} loading={reading} onPress={() => input.current?.click()} />
    </>
  );
}
