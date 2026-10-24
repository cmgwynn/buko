import { useState } from 'react';
import { Linking } from 'react-native';
import { Body, Button, Notice } from './ui';

export function SubscriptionManagement() {
  const [error, setError] = useState<string | null>(null);
  async function open(url: string) {
    setError(null);
    try { await Linking.openURL(url); }
    catch { setError('Could not open subscription settings. Open the App Store or Google Play subscriptions in your store account to cancel.'); }
  }
  return <>
    <Body>Deleting your Buko account does not stop store billing. Cancel renewal in the store where you subscribed, even if you use Buko on a different device. Opening these links does not itself cancel a subscription; confirm cancellation in the store.</Body>
    <Button title="Manage or cancel Apple subscription" variant="secondary" onPress={() => { void open('https://apps.apple.com/account/subscriptions'); }} />
    <Button title="Manage or cancel Google Play subscription" variant="secondary" onPress={() => { void open('https://play.google.com/store/account/subscriptions?package=com.cmgwynn.buko'); }} />
    {error ? <Notice tone="danger">{error}</Notice> : null}
  </>;
}
