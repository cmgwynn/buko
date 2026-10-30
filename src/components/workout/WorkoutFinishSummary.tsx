import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Disclosure, Heading, Notice } from '../ui';
import { formatDuration, toDisplayWeight, weightUnit } from '../../lib/fitness/format';
import { colors, spacing, typography } from '../../theme';

export interface WorkoutRecordCard { exerciseName: string; label: string; detail: string }
export function WorkoutFinishSummary({ durationSec, volumeKg, completedSets, records, cachedHistory, units }: {
  durationSec: number; volumeKg: number; completedSets: number; records: WorkoutRecordCard[]; cachedHistory: boolean;
  units: 'metric' | 'imperial';
}) {
  return <View>
    <Card>
      <Heading>Workout summary</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, marginVertical: spacing.lg }}>
        <View><Text style={{ ...typography.heading, fontSize: 28 }}>{formatDuration(durationSec)}</Text><Text style={typography.small}>Active duration</Text></View>
        <View><Text style={{ ...typography.heading, fontSize: 28 }}>{completedSets}</Text><Text style={typography.small}>Sets completed</Text></View>
        <View><Text style={{ ...typography.heading, fontSize: 28 }}>{Math.round(toDisplayWeight(volumeKg, units)).toLocaleString()}</Text><Text style={typography.small}>{weightUnit(units)} working-set volume</Text></View>
      </View>
      <Text style={typography.small}>Volume counts completed working sets only; warm-ups and cardio are excluded.</Text>
      <Disclosure title="How volume is counted"><Text style={typography.small}>Volume is external weight × repetitions for completed working sets. Warm-ups, unfinished sets and cardio distance are excluded from lifting volume.</Text></Disclosure>
    </Card>
    {records.length ? <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ionicons name="trophy" color={colors.primary} size={36} /><Heading>New personal records!</Heading>
      </View>
      <Text style={[typography.body, { marginVertical: spacing.sm }]}>A little progress worth celebrating.</Text>
      {records.map((record, index) => <View key={`${record.exerciseName}:${record.label}:${index}`} style={{ marginVertical: spacing.sm }}>
        <Text style={typography.subheading}>{record.exerciseName} · {record.label}</Text>
        <Text style={typography.body}>{record.detail}</Text>
      </View>)}
    </Card> : null}
    {cachedHistory ? <><Notice tone="info">Records use this device&apos;s history and are provisional until synced.</Notice><Disclosure title="About record comparisons"><Text style={typography.small}>Without cached history, a result is a baseline, not a new record.</Text></Disclosure></> : null}
  </View>;
}
