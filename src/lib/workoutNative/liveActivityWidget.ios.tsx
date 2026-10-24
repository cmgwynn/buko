import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { WorkoutActivityProps } from './types';

// Runs in the widget extension's isolated runtime: only @expo/ui/swift-ui, no hooks, no outer constants.
const BukoWorkoutActivity = (props: WorkoutActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const accent = environment.isLuminanceReduced ? '#FFFFFF' : '#356A55';
  const resting = props.restEndMs != null && props.restStartMs != null && !props.paused;
  const restOver = resting && environment.isStale === true;
  const status = props.paused ? 'Paused' : restOver ? 'Rest over' : 'In progress';
  const countdown = resting && !restOver ? (
    <Text
      timerInterval={{ lower: new Date(props.restStartMs ?? 0), upper: new Date(props.restEndMs ?? 0) }}
      countsDown
      modifiers={[font({ weight: 'bold', size: 28 }), monospacedDigit(), foregroundStyle(accent)]}
    />
  ) : (
    <Text modifiers={[font({ weight: 'semibold', size: 15 }), foregroundStyle(accent)]}>{status}</Text>
  );
  const smallCountdown = resting && !restOver ? (
    <Text
      timerInterval={{ lower: new Date(props.restStartMs ?? 0), upper: new Date(props.restEndMs ?? 0) }}
      countsDown
      modifiers={[monospacedDigit(), foregroundStyle(accent)]}
    />
  ) : (
    <Text>{props.setsLabel}</Text>
  );
  return {
    banner: (
      <HStack modifiers={[padding({ all: 14 })]}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 13 })]}>{props.workoutName}</Text>
          <Text modifiers={[font({ weight: 'bold', size: 17 })]}>{props.exerciseName}</Text>
          <Text modifiers={[font({ size: 13 })]}>{props.setsLabel}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[font({ size: 12 })]}>{resting ? 'Rest' : ''}</Text>
          {countdown}
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName="figure.strengthtraining.traditional" color={accent} />,
    compactTrailing: smallCountdown,
    minimal: <Image systemName="timer" color={accent} />,
    expandedLeading: <Image systemName="figure.strengthtraining.traditional" color={accent} />,
    expandedCenter: <Text modifiers={[font({ weight: 'bold' })]}>{props.exerciseName}</Text>,
    expandedTrailing: smallCountdown,
    expandedBottom: <Text modifiers={[font({ size: 13 })]}>{props.workoutName + ' · ' + props.setsLabel}</Text>,
  };
};

export const workoutLiveActivity = createLiveActivity<WorkoutActivityProps>('BukoWorkoutActivity', BukoWorkoutActivity);
