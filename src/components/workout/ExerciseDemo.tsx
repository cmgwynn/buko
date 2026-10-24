import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import type { Pattern, Pose, Prop, Pt } from '../../lib/workoutNative/demoPoses';
import { getExerciseDemo } from '../../lib/workoutNative/exerciseDemos';
import { colors, radius, spacing, typography } from '../../theme';

export interface ExerciseDemoExercise {
  name: string;
  category?: 'strength' | 'cardio' | string | null;
  muscle_groups?: readonly string[] | null;
  equipment?: string | null;
  /** Non-null for user-created exercises (they get a generic demo unless `imageUri` is provided). */
  user_id?: string | null;
}

export interface ExerciseDemoProps {
  exercise: ExerciseDemoExercise;
  /** Optional local image chosen by the user for a custom exercise; parent owns picking/storage. */
  imageUri?: string | null;
  /** Hides cues and notes; shows the figure only. */
  compact?: boolean;
  testID?: string;
}

const INK = colors.text;
const FAR = colors.textMuted;
const PROP = colors.primary;
const STROKE = 3.2;

const mirror = (p: Pt): Pt => [100 - p[0], p[1]];

function limb(points: (Pt | undefined)[], color: string, opacity = 1, key?: string) {
  const pts = points.filter((p): p is Pt => !!p);
  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  return <Path key={key} d={d} stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={opacity} />;
}

function footLine(knee: Pt, foot: Pt, toe: Pt | undefined, color: string, opacity: number, facing: 1 | -1, key: string) {
  if (toe) return limb([foot, toe], color, opacity, key);
  if (foot[1] < 87 || Math.abs(knee[0] - foot[0]) > 14 && Math.abs(knee[1] - foot[1]) < 8) return null;
  return limb([foot, [foot[0] + 6 * facing, foot[1]]], color, opacity, key);
}

function Figure({ pose, view }: { pose: Pose; view: Pattern['view'] }) {
  const neck: Pt = [pose.shoulder[0], pose.shoulder[1]];
  if (view === 'front') {
    const lShoulder = mirror(pose.shoulder);
    const lHip = mirror(pose.hip);
    return (
      <G>
        {limb([lShoulder, pose.shoulder], INK, 1, 'shoulders')}
        {limb([lHip, pose.hip], INK, 1, 'hips')}
        {limb([[50, pose.shoulder[1]], [50, pose.hip[1]]], INK, 1, 'torso')}
        {limb([[50, pose.shoulder[1]], [50, pose.head[1] + 6]], INK, 1, 'neck')}
        {limb([pose.shoulder, pose.elbow, pose.hand], INK, 1, 'armR')}
        {limb([lShoulder, mirror(pose.elbow2 ?? pose.elbow), mirror(pose.hand2 ?? pose.hand)], INK, 1, 'armL')}
        {limb([pose.hip, pose.knee, pose.foot], INK, 1, 'legR')}
        {limb([lHip, mirror(pose.knee2 ?? pose.knee), mirror(pose.foot2 ?? pose.foot)], INK, 1, 'legL')}
        <Circle cx={pose.head[0]} cy={pose.head[1]} r={6} stroke={INK} strokeWidth={STROKE} fill={colors.surface} />
      </G>
    );
  }
  const facing: 1 | -1 = pose.head[0] >= pose.hip[0] ? 1 : -1;
  return (
    <G>
      {limb([pose.shoulder, pose.elbow2, pose.hand2], FAR, 0.55, 'armFar')}
      {limb([pose.hip, pose.knee2, pose.foot2], FAR, 0.55, 'legFar')}
      {pose.knee2 && pose.foot2 ? footLine(pose.knee2, pose.foot2, undefined, FAR, 0.55, facing, 'footFar') : null}
      {limb([neck, pose.hip], INK, 1, 'torso')}
      {limb([neck, pose.head], INK, 1, 'neck')}
      {limb([pose.hip, pose.knee, pose.foot], INK, 1, 'leg')}
      {footLine(pose.knee, pose.foot, pose.toe, INK, 1, facing, 'foot')}
      {limb([pose.shoulder, pose.elbow, pose.hand], INK, 1, 'arm')}
      <Circle cx={pose.head[0]} cy={pose.head[1]} r={6} stroke={INK} strokeWidth={STROKE} fill={colors.surface} />
    </G>
  );
}

function hands(pose: Pose, view: Pattern['view']): Pt[] {
  if (view === 'front') return [pose.hand, mirror(pose.hand2 ?? pose.hand)];
  return [pose.hand];
}

function PropShape({ prop, pose, view, index }: { prop: Prop; pose: Pose; view: Pattern['view']; index: number }) {
  const k = `prop-${index}`;
  switch (prop.kind) {
    case 'barbell': {
      const p = prop.at === 'hand' ? pose.hand : prop.at === 'shoulder' ? pose.shoulder : pose.hip;
      const y = prop.at === 'shoulder' ? p[1] - 3 : p[1];
      if (view === 'front') {
        return (
          <G key={k}>
            <Line x1={8} y1={y} x2={92} y2={y} stroke={PROP} strokeWidth={2.4} strokeLinecap="round" />
            <Rect x={8} y={y - 7} width={5} height={14} rx={1.5} fill={PROP} />
            <Rect x={87} y={y - 7} width={5} height={14} rx={1.5} fill={PROP} />
          </G>
        );
      }
      return <Circle key={k} cx={p[0]} cy={y} r={7} stroke={PROP} strokeWidth={2.4} fill={colors.primarySoft} />;
    }
    case 'dumbbell':
      return (
        <G key={k}>
          {hands(pose, view).map((h, i) => (
            <Rect key={i} x={h[0] - 5} y={h[1] - 2.5} width={10} height={5} rx={2} fill={PROP} />
          ))}
        </G>
      );
    case 'kettlebell':
      return (
        <G key={k}>
          <Circle cx={pose.hand[0]} cy={pose.hand[1] + 6} r={5} fill={PROP} />
          <Path d={`M${pose.hand[0] - 3} ${pose.hand[1] + 2} Q${pose.hand[0]} ${pose.hand[1] - 3} ${pose.hand[0] + 3} ${pose.hand[1] + 2}`} stroke={PROP} strokeWidth={2} fill="none" />
        </G>
      );
    case 'cable': {
      const target = view === 'front' && prop.anchor[0] < 50 ? mirror(pose.hand2 ?? pose.hand) : pose.hand;
      return (
        <G key={k}>
          <Line x1={prop.anchor[0]} y1={prop.anchor[1]} x2={target[0]} y2={target[1]} stroke={PROP} strokeWidth={1.4} strokeDasharray="3 2" />
          <Circle cx={prop.anchor[0]} cy={prop.anchor[1]} r={2.5} fill={PROP} />
        </G>
      );
    }
    case 'block':
      return <Rect key={k} x={prop.x} y={prop.y} width={prop.w} height={prop.h} rx={1.5} fill={colors.surfaceMuted} stroke={colors.border} strokeWidth={1} />;
    case 'bar':
      return <Line key={k} x1={prop.x1} y1={prop.y} x2={prop.x2} y2={prop.y} stroke={PROP} strokeWidth={2.6} strokeLinecap="round" />;
    case 'wheel':
      return <Circle key={k} cx={pose.hand[0]} cy={Math.min(pose.hand[1] + 1, 85)} r={5} stroke={PROP} strokeWidth={2.4} fill={colors.primarySoft} />;
    case 'pedal':
      return <Circle key={k} cx={prop.center[0]} cy={prop.center[1]} r={prop.r} stroke={PROP} strokeWidth={1.6} strokeDasharray="2 2" fill="none" />;
    case 'water':
      return <Path key={k} d="M0 62 Q12 58 25 62 T50 62 T75 62 T100 62" stroke="#6C8EBF" strokeWidth={2} fill="none" />;
    case 'slope':
      return <Polygon key={k} points="0,90 100,90 100,74" fill={colors.surfaceMuted} />;
    case 'rope':
      return <Path key={k} d={`M${pose.hand[0]} ${pose.hand[1]} Q50 ${pose.foot[1] + 14} ${100 - pose.hand[0]} ${pose.hand[1]}`} stroke={PROP} strokeWidth={1.6} fill="none" />;
    default:
      return null;
  }
}

function Frame({ pose, pattern, props, label }: { pose: Pose; pattern: Pattern; props: readonly Prop[]; label: string }) {
  const isBackground = (p: Prop) => p.kind === 'block' || p.kind === 'slope' || p.kind === 'water' || p.kind === 'pedal';
  const background = props.filter(isBackground);
  const foreground = props.filter((p) => !isBackground(p));
  return (
    <View style={styles.frame}>
      <Svg viewBox="0 -8 100 106" width="100%" height="100%" style={styles.svg}>
        <Line x1={2} y1={90.5} x2={98} y2={90.5} stroke={colors.border} strokeWidth={1.5} />
        {background.map((prop, i) => (
          <PropShape key={`b${i}`} prop={prop} pose={pose} view={pattern.view} index={i} />
        ))}
        <Figure pose={pose} view={pattern.view} />
        {foreground.map((prop, i) => (
          <PropShape key={`f${i}`} prop={prop} pose={pose} view={pattern.view} index={i} />
        ))}
      </Svg>
      <Text style={styles.frameLabel}>{label}</Text>
    </View>
  );
}

/** Original schematic two-step demonstration with text cues for an exercise. */
export function ExerciseDemo({ exercise, imageUri, compact = false, testID }: ExerciseDemoProps) {
  const { demo, pattern, generic } = getExerciseDemo({ name: exercise.name, category: exercise.category ?? undefined, user_id: exercise.user_id });
  const muscles = (exercise.muscle_groups ?? []).filter(Boolean);
  const description = `${exercise.name} demonstration: ${pattern.labels[0]}, then ${pattern.labels[1]}.`;

  return (
    <View style={styles.card} testID={testID ?? 'exercise-demo'}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Your photo for ${exercise.name}`}
        />
      ) : (
        <View style={styles.frames} accessible accessibilityRole="image" accessibilityLabel={description}>
          <Frame pose={pattern.frames[0]} pattern={pattern} props={demo.props} label={`1 · ${pattern.labels[0]}`} />
          <Frame pose={pattern.frames[1]} pattern={pattern} props={demo.props} label={`2 · ${pattern.labels[1]}`} />
        </View>
      )}
      {!compact ? (
        <View style={styles.body}>
          {generic && !imageUri ? (
            <Text style={styles.note}>General illustration. Custom exercises don’t have a specific demo yet.</Text>
          ) : null}
          <View accessibilityRole="list">
            {demo.cues.map((cue, i) => (
              <View key={i} style={styles.cueRow}>
                <Text style={styles.cueIndex}>{i + 1}</Text>
                <Text style={styles.cue}>{cue}</Text>
              </View>
            ))}
          </View>
          {muscles.length ? (
            <View style={styles.chips}>
              {muscles.map((m) => (
                <Text key={m} style={styles.chip}>
                  {m}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={styles.note}>Original Buko illustration. General guidance only; stop if you feel pain and adjust to what feels right for you.</Text>
        </View>
      ) : null}
    </View>
  );
}

export default ExerciseDemo;

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  frames: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.background },
  frame: { flex: 1, alignItems: 'center' },
  svg: { aspectRatio: 100 / 106 },
  frameLabel: { ...typography.small, textAlign: 'center', marginTop: spacing.xs },
  image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceMuted },
  body: { padding: spacing.md, gap: spacing.sm },
  cueRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.xs },
  cueIndex: { ...typography.label, color: colors.primary, width: 16 },
  cue: { ...typography.body, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { ...typography.label, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'capitalize' },
  note: { ...typography.small },
});
