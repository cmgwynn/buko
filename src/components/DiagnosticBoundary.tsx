import { Component, useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { activateDiagnostics, loadDiagnosticConsent, reportDiagnostic } from '../lib/diagnostics/client';
import { useAuth } from '../providers/AuthProvider';
import { Body, Button, Heading, Notice, Screen } from './ui';
function report(code: 'render_failure' | 'unhandled_js', fatal: boolean) {
  void reportDiagnostic(code, fatal).catch(() => console.warn('Optional diagnostic signal could not be delivered.'));
}
export function DiagnosticLifecycle() {
  const { session } = useAuth();
  useEffect(() => {
    let live = true;
    activateDiagnostics(null, false);
    if (session) void loadDiagnosticConsent(session.user.id).then((enabled) => {
      if (live) activateDiagnostics(session.user.id, enabled);
    }).catch(() => console.warn('Optional diagnostic preference could not be loaded; reporting remains off.'));
    return () => { live = false; activateDiagnostics(null, false); };
  }, [session?.user.id]);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handler = () => report('unhandled_js', true);
      window.addEventListener('error', handler);
      return () => window.removeEventListener('error', handler);
    }
    type Handler = (error: Error, fatal?: boolean) => void;
    const runtime = globalThis as typeof globalThis & { ErrorUtils?: { getGlobalHandler(): Handler; setGlobalHandler(handler: Handler): void } };
    const utils = runtime.ErrorUtils;
    if (!utils) return;
    const previous = utils.getGlobalHandler();
    const handler: Handler = (error, fatal) => { report('unhandled_js', Boolean(fatal)); previous(error, fatal); };
    utils.setGlobalHandler(handler);
    return () => { if (utils.getGlobalHandler() === handler) utils.setGlobalHandler(previous); };
  }, []);
  return null;
}
export class DiagnosticBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { report('render_failure', true); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Screen><Heading>Something went wrong</Heading>
      <Notice tone="danger">Buko could not display this screen. Your saved account data has not been intentionally changed.</Notice>
      <Body>Try reopening the screen. If it fails again, restart Buko. Optional reports contain only a fixed error category, platform and release, not screen content.</Body>
      <Button title="Try again" onPress={() => this.setState({ failed: false })} />
    </Screen>;
  }
}
