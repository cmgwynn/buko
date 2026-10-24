# Workout native features (Live Activity, rest alerts, demos)

This page covers Buko's on-device workout extras. It explains how to set them up for a development build, how to test them, and what they cannot do.

| Feature | iPhone (dev/store build) | Android | Web | Expo Go |
| --- | --- | --- | --- | --- |
| Lock-screen Live Activity (current exercise, sets, rest countdown) | iOS 16.4+ | — (shows `unavailable`) | — | — |
| Local rest-over notification with Buko cue sound | ✓ | ✓ (`workout-rest` channel) | — | Limited\* |
| Foreground haptic + cue sound at rest end | ✓ | ✓ (haptic depends on device) | — | ✓ |
| Original exercise demos (`ExerciseDemo`) | ✓ | ✓ | ✓ | ✓ |

\*Expo Go cannot use the custom notification sound, because the sound is bundled by the config plugin at build time. Use a development build for real testing.

These native extras run on the device. There is no push server or APNs Live Activity token. The timer, demonstrations and Live Activity do not transmit workout data. Normal Buko workout sync still uses Supabase when connected; optional health export writes to the device's HealthKit/Health Connect store. Live Activity updates come from the app's JavaScript while it runs. Between those updates, the system draws the countdown by itself.

## Code map

- `src/lib/workoutNative/useWorkoutNative.ts`: a hook, mounted once in the root `WorkoutModeProvider`.
- `src/lib/workoutNative/liveActivityWidget.ios.tsx`: the SwiftUI layout for the Live Activity, written with `createLiveActivity` from expo-widgets and `@expo/ui/swift-ui`.
- `src/lib/workoutNative/liveActivity.ts`: platform guard (iOS only, not Expo Go, iOS 16.4+, extension present), adapter, and relaunch reconciliation.
- `src/lib/workoutNative/alerts.ts`: local notifications (expo-notifications), haptics (expo-haptics) and the cue sound (expo-audio).
- `src/lib/workoutNative/restTimer.ts`: pure rules for timers and alert de-duplication. Unit tested.
- `src/lib/workoutNative/network.ts`: `useNetworkStatus()` (expo-network).
- `src/lib/workoutNative/demoPoses.ts` and `exerciseDemos.ts`, plus `src/components/workout/ExerciseDemo.tsx`: original schematic demos.
- `scripts/generate-workout-cue.mjs` builds `assets/sounds/buko_rest_cue.wav`.

### Hook contract

```ts
const native = useWorkoutNative(
  session ? { sessionId, name, exerciseName, completedSets, totalSets, restEndsAt /* epoch ms | null */, active, paused } : null,
  { ready: sessionLoaded, deepLinkUrl: 'buko://workout/active' },
);
native.liveActivity // { status: 'unavailable' | 'idle' | 'active' | 'error', reason? }
native.alerts       // { status: 'unknown' | 'granted' | 'denied' | 'unavailable' }
await native.enableAlerts(); // asks for notification permission; call only from a button press
await native.dismissRest();  // rest skipped: cancel its alert/cue
await native.pause();        // hold alerts; prefer passing `paused: true` in state
await native.end();          // finish/discard: end the activity and cancel alerts
```

- Pass `ready: false` until the persisted session has loaded. On first readiness, the hook ends any Live Activity left from an older session or another account. It only keeps the activity recorded for the current `sessionId`.
- Passing `null` or `active: false` ends the activity.
- After `end()`, the same `sessionId` is never restarted.

## Step-by-step: development build with the Live Activity (iOS)

Before you start, you need:
- a paid Apple Developer Program membership;
- `eas-cli` (version 16 or later, as set in `eas.json`), with `eas login` done;
- an iPhone on iOS 16.4 or later. Live Activities do not show on the simulator lock screen the same way, and our `development` profile builds for physical devices.

These values are already in the repo; you don't need to edit them:
- In `app.json`, the `expo-widgets` plugin is set up like this:
  - extension bundle id `com.cmgwynn.buko.ExpoWidgetsTarget`;
  - App Group `group.com.cmgwynn.buko`;
  - `enablePushNotifications: false`, so no `aps-environment` entitlement is added for the extension;
  - `frequentUpdates: false`;
  - no home-screen widgets.
- During prebuild, the plugin does the following:
  - adds `NSSupportsLiveActivities` and the App Group entitlement to the app;
  - creates the `ExpoWidgetsTarget` extension, with a deployment target of 16.4;
  - declares that extension under `extra.eas.build.experimental.ios.appExtensions`, so EAS creates credentials for it before the build. See [Expo: iOS App Extensions](https://docs.expo.dev/build-reference/app-extensions/).
- `babel-preset-expo` compiles the `'widget'` directive automatically.

1. **Install dependencies.** Run `npm ci`. Do not run `expo upgrade`, because the project is pinned to SDK 57.
2. **Optional: check the generated native project locally.** Back up any custom native changes before using `--clean`, which regenerates the native project. Run `npx expo prebuild --platform ios --clean`. Check that `ios/ExpoWidgetsTarget` exists and that `ios/buko/Info.plist` has `NSSupportsLiveActivities`. This project uses Continuous Native Generation, so the generated `ios/` directory is not committed.
3. **Register your test iPhone** for internal distribution: run `eas device:create` and install the profile it gives you.
4. **Build:** run `eas build --profile development --platform ios`. When EAS CLI asks, let it log in to your Apple account. It then:
   - registers or updates the App IDs `com.cmgwynn.buko` and `com.cmgwynn.buko.ExpoWidgetsTarget`;
   - creates the App Group `group.com.cmgwynn.buko` and assigns it to both App IDs. EAS capability sync handles App Groups, but this needs an Apple cookie login run from your machine. The App Store Connect API key alone cannot assign App Groups. See [Expo: iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/).
   - creates one provisioning profile per target (app and extension).
5. **If capability sync is disabled or fails** (for example, if you build with `EXPO_NO_CAPABILITY_SYNC=1`), do these steps by hand in [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list):
   1. Create the App Group `group.com.cmgwynn.buko`.
   2. Edit the App IDs `com.cmgwynn.buko` and `com.cmgwynn.buko.ExpoWidgetsTarget`, turn on **App Groups**, and select that group.
   3. Run `eas credentials -p ios`, remove the old provisioning profiles for both targets so they are regenerated with the new entitlement, then build again.
   4. To see sync details, run `EXPO_DEBUG=1 eas build ...`.
6. **Install and run.** Install the build from the EAS link or QR code, then start Metro with `npx expo start --dev-client`.
7. **Test on the phone:**
   1. Start a workout and log a set so a rest timer starts.
   2. Lock the phone. The lock screen (and the Dynamic Island on supported models) shows the workout, the exercise, the sets, and a countdown.
   3. Press +15 s or −15 s in the app. The countdown and the scheduled notification both move.
   4. Pause the workout. The activity shows "Paused" and no alert fires.
   5. Finish or discard the workout. The activity disappears.
   6. Force-quit the app during a workout, then relaunch it. An activity from an older or different session is ended. The current session's activity is kept.
8. **Production and TestFlight:** run `eas build --profile production --platform ios`. EAS reuses the same two App IDs and the App Group. You don't need push or Live Activity tokens, because Buko never updates the activity remotely.

If the activity never appears, check:
- iPhone **Settings → Buko → Live Activities** is on;
- the build was made after `expo-widgets` was added;
- `native.liveActivity.reason` for the exact cause.

## Step-by-step: rest alerts

1. In the app, the user taps an "Enable rest alerts" button, and the parent calls `enableAlerts()`. Buko never asks for this permission on mount.
2. On Android, enabling alerts creates the `workout-rest` notification channel with `buko_rest_cue.wav`. Users can change its sound or importance later in system settings. Android only reads the channel sound when the channel is first created.
3. Each session has one notification, with the fixed identifier `buko-rest-<sessionId>`. It is scheduled with a date trigger at `restEndsAt`. A ±15 s change cancels it and schedules it again.
4. While Buko is open and on screen, the notification is cancelled 1.5 s before rest ends. The in-app haptic and cue play instead. When the app comes back to the foreground after the rest ended, Buko does not replay the cue. This prevents double alerts.
5. To test, enable alerts, start a 30 s rest, and send the app to the background. A "Rest is over" notification with the Buko sound should arrive. Then repeat with the app open: you should feel the haptic and hear the cue exactly once.

The bundled sound comes from the `expo-notifications` plugin `sounds` option. After changing the sound, run `node scripts/generate-workout-cue.mjs`, then rebuild the native app. JavaScript-only (OTA) updates cannot change notification sounds.

## Network status

`useNetworkStatus()` returns `{ online: boolean | null }` from expo-network. `null` means unknown. The parent can use it to trigger `syncPendingWorkouts(userId)` when the device reconnects. The hook itself sends nothing.

## Exercise demos

```tsx
<ExerciseDemo exercise={{ name, category, muscle_groups, user_id }} imageUri={optionalUserPhotoUri} compact={false} />
```

- Every built-in exercise in `supabase/migrations/0003_fitness.sql` has its own two-step schematic and three cues. A test parses the seed file to check this.
- Custom exercises (those with a `user_id`) show a labelled generic illustration. If the parent passes `imageUri`, they show the user's own photo instead. The parent is responsible for picking and storing that photo.
- The cues are general reminders, not personal coaching.

## Honest limitations

- **No background execution.** Buko does not claim to run in the background:
  - the lock-screen countdown is drawn by iOS (`Text timerInterval`);
  - rest-over alerts are local notifications already scheduled with the OS.
  
  Anything else, such as moving to the next exercise or logging sets, only updates while the app is running.
- **A killed app** cannot end its own Live Activity. The activity stays until the next launch (which reconciles it) or until iOS ends it. Apple allows a Live Activity to run for up to 8 hours and to stay on the lock screen for up to 4 more hours. After the rest end time, the activity is marked stale and shows "Rest over".
- **Expo Go and web** report `unavailable` and do nothing native. Android has no Live Activity equivalent here. The parent shows the in-app timer instead.
- **Users control these features.** People can turn off Live Activities, notifications, or sounds, and silent mode or Focus can mute the cue or the notification. Buko has no way to override this.
- **Frequent updates:** `NSSupportsLiveActivitiesFrequentUpdates` is off. Buko only updates when the workout changes, which is well within the system's budget.
- **Widget runtime limits:** the widget layout runs in an isolated runtime. It cannot use React hooks, app state, imports, or asynchronous work (see the [expo-widgets docs](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/)).

## Health export idempotency (adapter contract)

`HealthAdapter.writeWorkout` accepts `clientId` (the stable UUID of the workout). Both adapters set `supportsWorkoutIdempotency: true`:

- **iOS (HealthKit):**
  - each workout is saved with the sync metadata `HKMetadataKeySyncIdentifier` (raw key `HKSyncIdentifier`) = `buko-workout:<clientId>` and `HKMetadataKeySyncVersion` (raw key `HKSyncVersion`) = 1. The native module passes metadata through unchanged, so the raw keys are used;
  - before saving, Buko looks for an existing workout with that sync identifier and returns it if found;
  - Apple documents that a save with the same sync identifier replaces the stored sample only when its sync version is higher. Apple does not document what happens when the versions are equal, which is why Buko does the lookup first;
  - the lookup needs workout read permission. If read permission is denied, HealthKit's own handling of the sync identifier is the only protection against duplicates.
- **Android (Health Connect):** the ExerciseSession record is written with `metadata.clientRecordId = buko-workout:<clientId>` and `clientRecordVersion = 1`. Health Connect upserts by client record id, so a retry does not create a duplicate.
