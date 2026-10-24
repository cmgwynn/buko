import { useEffect, useState } from 'react';
import { Body, Button, Card, Disclosure, Notice, TextField } from './ui';
import { getMyPublicAlias, setMyPublicAlias } from '../lib/recipes/community';
import { validatePublicAlias } from '../lib/recipes/communityProfiles';

/** Opt-in pseudonym for shared recipes and reviews. Never prefilled from account names or email. */
export function PublicAliasCard() {
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getMyPublicAlias().then((alias) => { if (active) { setSaved(alias); setValue(alias ?? ''); setLoaded(true); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Public name unavailable.'); });
    return () => { active = false; };
  }, []);
  const check = validatePublicAlias(value);
  async function save(next: string | null) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const alias = await setMyPublicAlias(next);
      setSaved(alias); setValue(alias ?? '');
      setMessage(alias ? `Members now see “${alias}” on your shared recipes and reviews.` : 'Public name removed. Members see a generic member label.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Public name was not saved.'); }
    finally { setBusy(false); }
  }
  return <Card>
    <Disclosure title={saved ? `Public name: ${saved}` : 'Public name (optional)'}>
      <Body muted>Optional pseudonym shown to signed-in members on your shared recipes and reviews. Do not use your real name, email or contact details. Leave empty to appear as a generic member.</Body>
      <TextField label="Public name" value={value} onChangeText={(v) => setValue(v.slice(0, 30))} autoCapitalize="none" autoCorrect={false}
        placeholder="e.g. LentilFan" editable={loaded && !busy} error={value.trim() ? check.error : null} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {message ? <Notice tone="info">{message}</Notice> : null}
      <Button title="Save public name" loading={busy} disabled={!loaded || !check.alias || !!check.error || check.alias === saved}
        onPress={() => void save(check.alias)} />
      {saved ? <Button title="Remove public name" variant="ghost" disabled={busy} onPress={() => void save(null)} /> : null}
    </Disclosure>
  </Card>;
}
