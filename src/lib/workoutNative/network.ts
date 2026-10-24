import { useNetworkState } from 'expo-network';

/** Connectivity for offline workout sync UI. `online` is null while unknown. Purely local; nothing is sent. */
export function useNetworkStatus(): { online: boolean | null } {
  const state = useNetworkState();
  if (state.isConnected == null && state.isInternetReachable == null) return { online: null };
  return { online: state.isConnected !== false && state.isInternetReachable !== false };
}
