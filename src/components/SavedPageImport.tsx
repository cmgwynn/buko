import { Body } from './ui';

export interface SavedPageImportProps {
  disabled: boolean;
  onLoad: (html: string) => void;
  onError: (message: string) => void;
}

export function SavedPageImport(_props: SavedPageImportProps) {
  return <Body muted>Saved HTML import is available in the web version of Buko.</Body>;
}
