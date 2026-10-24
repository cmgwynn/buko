import { PATTERNS, type Pattern, type PatternKey, type Prop } from './demoPoses';

/**
 * Original Buko exercise demonstrations: schematic poses (demoPoses.ts) plus short cues written for Buko.
 * General movement reminders only, not individualized coaching or medical advice.
 */
export interface ExerciseDemoInfo {
  name: string;
  pattern: PatternKey;
  props: Prop[];
  cues: string[];
}

const BB_HAND: Prop = { kind: 'barbell', at: 'hand' };
const BB_SHOULDER: Prop = { kind: 'barbell', at: 'shoulder' };
const DB: Prop = { kind: 'dumbbell' };
const KB: Prop = { kind: 'kettlebell' };
const FLAT_BENCH: Prop = { kind: 'block', x: 14, y: 62, w: 46, h: 6 };
const INCLINE_BENCH: Prop = { kind: 'block', x: 30, y: 66, w: 28, h: 6 };
const SEAT: Prop = { kind: 'block', x: 30, y: 66, w: 24, h: 6 };
const BACK_PAD: Prop = { kind: 'block', x: 28, y: 28, w: 6, h: 40 };
const cable = (x: number, y: number): Prop => ({ kind: 'cable', anchor: [x, y] });

const d = (name: string, pattern: PatternKey, props: Prop[], cues: string[]): ExerciseDemoInfo => ({ name, pattern, props, cues });

export const BUILTIN_EXERCISE_DEMOS: ExerciseDemoInfo[] = [
  // Chest
  d('Barbell Bench Press', 'benchPress', [FLAT_BENCH, BB_HAND], ['Eyes under the bar, feet planted, shoulder blades drawn back.', 'Lower the bar with control to the middle of your chest.', 'Press up until your arms are straight without bouncing.']),
  d('Incline Barbell Bench Press', 'inclinePress', [INCLINE_BENCH, BB_HAND], ['Set the bench to a low incline and keep your back on the pad.', 'Lower the bar toward your upper chest.', 'Press up and slightly back over your shoulders.']),
  d('Dumbbell Bench Press', 'benchPress', [FLAT_BENCH, DB], ['Start with the dumbbells over your chest, palms facing forward.', 'Lower them to the sides of your chest, elbows slightly tucked.', 'Press up and bring the weights together over your chest.']),
  d('Incline Dumbbell Press', 'inclinePress', [INCLINE_BENCH, DB], ['Sit back on a low incline with the dumbbells at shoulder level.', 'Press up until your arms are straight above your upper chest.', 'Lower slowly to a comfortable depth.']),
  d('Push-Up', 'pushUp', [], ['Hands a little wider than shoulders, body in one straight line.', 'Lower your chest toward the floor, elbows angled back.', 'Push away until your arms are straight. Use a bench to make it easier.']),
  d('Chest Dip', 'dip', [{ kind: 'bar', y: 56, x1: 38, x2: 62 }], ['Support yourself on straight arms and lean slightly forward.', 'Bend your elbows to lower within a comfortable range.', 'Press back up without locking out hard.']),
  d('Machine Chest Press', 'seatedPress', [SEAT, BACK_PAD], ['Adjust the seat so the handles line up with mid-chest.', 'Press the handles forward until your arms are straight.', 'Return slowly, keeping your back against the pad.']),
  d('Cable Fly', 'flyFront', [cable(96, 22), cable(4, 22)], ['Stand between the pulleys with a slight bend in your elbows.', 'Bring your hands together in a wide hugging arc.', 'Open back out with control until you feel a gentle chest stretch.']),
  d('Dumbbell Fly', 'flyLying', [FLAT_BENCH, DB], ['Lie on the bench with the dumbbells above your chest.', 'Keep a soft bend in your elbows and open your arms wide.', 'Squeeze them back up along the same arc.']),
  d('Pec Deck', 'flyFront', [{ kind: 'block', x: 30, y: 6, w: 4, h: 50 }, { kind: 'block', x: 66, y: 6, w: 4, h: 50 }], ['Sit tall with your back on the pad and forearms or hands on the handles.', 'Bring the handles together in front of your chest.', 'Let them open slowly without overstretching.']),
  // Back
  d('Deadlift', 'deadlift', [BB_HAND], ['Bar over mid-foot, hinge down and grip just outside your legs.', 'Brace, keep your back long and push the floor away.', 'Stand tall, then lower by pushing your hips back first.']),
  d('Barbell Row', 'bentRow', [BB_HAND], ['Hinge forward with a flat back and soft knees.', 'Pull the bar toward your lower ribs, elbows going back.', 'Lower with control without letting your back round.']),
  d('Dumbbell Row', 'bentRow', [DB, { kind: 'block', x: 70, y: 60, w: 22, h: 30 }], ['Support yourself on a bench with your back flat.', 'Pull the dumbbell toward your hip.', 'Lower it until your arm is straight, then repeat.']),
  d('Pull-Up', 'pullUp', [{ kind: 'bar', y: 8, x1: 30, x2: 70 }], ['Hang with an overhand grip a little wider than your shoulders.', 'Pull your chest toward the bar, leading with your elbows.', 'Lower all the way with control. Bands or a machine can assist.']),
  d('Chin-Up', 'pullUp', [{ kind: 'bar', y: 8, x1: 30, x2: 70 }], ['Hang with palms facing you, about shoulder-width apart.', 'Pull until your chin clears the bar.', 'Lower slowly to a full hang.']),
  d('Lat Pulldown', 'latPulldown', [SEAT, cable(46, -6)], ['Sit with your thighs secured under the pads.', 'Pull the bar down to your upper chest, elbows down and back.', 'Let the bar rise slowly until your arms are straight.']),
  d('Seated Cable Row', 'seatedRow', [cable(96, 72)], ['Sit tall with your knees slightly bent.', 'Pull the handle toward your stomach, shoulder blades back.', 'Reach forward slowly without rounding your back.']),
  d('T-Bar Row', 'bentRow', [BB_HAND], ['Straddle the bar and hinge with a flat back.', 'Row the handles toward your chest.', 'Lower with control, keeping your hips still.']),
  d('Straight-Arm Pulldown', 'straightArmPulldown', [cable(80, -6)], ['Face the cable with arms almost straight overhead.', 'Sweep the bar down to your thighs.', 'Return slowly, keeping your elbows nearly locked.']),
  d('Back Extension', 'backExtension', [{ kind: 'block', x: 40, y: 54, w: 14, h: 6 }], ['Set the pad just below your hips.', 'Lower your upper body with a long spine.', 'Rise until your body is in a straight line; avoid arching past it.']),
  d('Face Pull', 'facePull', [cable(96, 18)], ['Set the rope around head height.', 'Pull it toward your face, hands finishing beside your ears.', 'Return slowly with your shoulders down.']),
  // Shoulders
  d('Overhead Press', 'pressStanding', [BB_HAND], ['Bar at your collarbones, squeeze your glutes and brace.', 'Press straight up, moving your head back slightly for the bar.', 'Finish with the bar over your mid-foot, then lower with control.']),
  d('Dumbbell Shoulder Press', 'pressSeated', [SEAT, BACK_PAD, DB], ['Start with the dumbbells at shoulder height.', 'Press up until your arms are straight overhead.', 'Lower back to your shoulders slowly.']),
  d('Arnold Press', 'pressSeated', [SEAT, BACK_PAD, DB], ['Start with palms facing you at shoulder height.', 'Rotate your palms forward as you press up.', 'Reverse the rotation as you lower.']),
  d('Lateral Raise', 'lateralRaise', [DB], ['Stand tall with a slight bend in your elbows.', 'Raise the weights out to the sides to about shoulder height.', 'Lower slowly; light weights work well.']),
  d('Front Raise', 'frontRaise', [DB], ['Stand tall with the weights in front of your thighs.', 'Raise them forward to about shoulder height.', 'Lower slowly without swinging.']),
  d('Rear Delt Fly', 'rearDeltFly', [DB], ['Hinge forward with a flat back.', 'Open your arms out to the sides, leading with the elbows.', 'Lower with control.']),
  d('Upright Row', 'uprightRow', [BB_HAND], ['Hold the bar in front of your thighs.', 'Lift it along your body, elbows leading, to a comfortable height.', 'Lower slowly. Stop lower if your shoulders feel pinched.']),
  d('Barbell Shrug', 'shrug', [BB_HAND], ['Hold the bar at arm\u2019s length.', 'Lift your shoulders straight up toward your ears.', 'Pause briefly, then lower fully.']),
  d('Dumbbell Shrug', 'shrug', [DB], ['Hold a dumbbell in each hand at your sides.', 'Shrug straight up without rolling your shoulders.', 'Lower slowly.']),
  // Biceps
  d('Barbell Curl', 'curl', [BB_HAND], ['Stand tall with elbows at your sides.', 'Curl the bar up without swinging your body.', 'Lower all the way with control.']),
  d('Dumbbell Curl', 'curl', [DB], ['Palms forward, elbows close to your sides.', 'Curl the weights up toward your shoulders.', 'Lower slowly until your arms are straight.']),
  d('Hammer Curl', 'curl', [DB], ['Hold the dumbbells with palms facing each other.', 'Curl up keeping that grip.', 'Lower with control.']),
  d('Preacher Curl', 'preacherCurl', [{ kind: 'block', x: 50, y: 50, w: 14, h: 6 }, BB_HAND], ['Rest the back of your upper arms on the pad.', 'Curl up without lifting your elbows.', 'Lower slowly, stopping short of a hard lockout.']),
  d('Cable Curl', 'curl', [cable(60, 92)], ['Stand facing a low pulley.', 'Curl the handle up, elbows still.', 'Lower slowly against the cable.']),
  d('Incline Dumbbell Curl', 'inclineCurl', [INCLINE_BENCH, DB], ['Lie back on an incline bench with arms hanging.', 'Curl up without moving your upper arms.', 'Lower all the way down.']),
  // Triceps
  d('Triceps Pushdown', 'pushdown', [cable(62, -6)], ['Elbows tucked at your sides.', 'Push the handle down until your arms are straight.', 'Let it rise to about chest height, elbows still.']),
  d('Skull Crusher', 'skullCrusher', [FLAT_BENCH, BB_HAND], ['Lie on a bench with the weight over your shoulders.', 'Bend your elbows to lower toward your forehead.', 'Extend back up, keeping upper arms steady.']),
  d('Overhead Triceps Extension', 'overheadExtension', [DB], ['Hold one dumbbell overhead with both hands.', 'Lower it behind your head by bending your elbows.', 'Extend back up, elbows pointing forward.']),
  d('Close-Grip Bench Press', 'benchPress', [FLAT_BENCH, BB_HAND], ['Grip the bar about shoulder-width.', 'Lower to your lower chest, elbows close.', 'Press up until your arms are straight.']),
  d('Bench Dip', 'benchDip', [{ kind: 'block', x: 22, y: 62, w: 16, h: 28 }], ['Hands on the bench edge behind you, legs forward.', 'Bend your elbows to lower your hips.', 'Press back up. Bend your knees to make it easier.']),
  d('Diamond Push-Up', 'pushUp', [], ['Hands close together under your chest.', 'Lower with elbows close to your body.', 'Push back up. Kneeling is a fine starting option.']),
  // Legs
  d('Back Squat', 'squatBackBar', [BB_SHOULDER], ['Bar on your upper back, feet about shoulder-width.', 'Sit down and back, knees following your toes.', 'Drive up through your whole foot.']),
  d('Front Squat', 'squatFront', [BB_SHOULDER], ['Bar resting on the front of your shoulders, elbows high.', 'Squat down keeping your chest up.', 'Stand back up with the bar over mid-foot.']),
  d('Goblet Squat', 'squatGoblet', [DB], ['Hold one weight close to your chest.', 'Squat between your knees, chest tall.', 'Stand up pushing through your heels.']),
  d('Leg Press', 'legPress', [{ kind: 'block', x: 70, y: 36, w: 6, h: 30 }], ['Feet flat on the platform about hip-width.', 'Lower until your knees are comfortably bent; keep your hips down.', 'Press back up without locking your knees hard.']),
  d('Hack Squat', 'squatFront', [{ kind: 'block', x: 30, y: 20, w: 5, h: 50 }], ['Back against the pad, shoulders under the supports.', 'Lower with control to a comfortable depth.', 'Push the platform away to stand.']),
  d('Lunge', 'lunge', [DB], ['Step forward into a long stance.', 'Lower until both knees are bent, torso upright.', 'Push off the front foot to return.']),
  d('Walking Lunge', 'lunge', [DB], ['Step forward and lower under control.', 'Push through the front foot and bring the back leg through.', 'Keep a steady rhythm and stay tall.']),
  d('Bulgarian Split Squat', 'splitSquat', [{ kind: 'block', x: 14, y: 64, w: 18, h: 26 }, DB], ['Rear foot on a bench behind you.', 'Lower straight down over the front foot.', 'Drive up through the front heel.']),
  d('Step-Up', 'stepUp', [{ kind: 'block', x: 54, y: 78, w: 24, h: 12 }, DB], ['Place your whole foot on a stable step.', 'Push through that foot to stand up tall.', 'Step down with control and repeat.']),
  d('Leg Extension', 'legExtension', [SEAT], ['Pad on your lower shins, knees in line with the pivot.', 'Straighten your legs smoothly.', 'Lower with control.']),
  d('Romanian Deadlift', 'hinge', [BB_HAND], ['Stand tall with soft knees.', 'Push your hips back, sliding the bar down your thighs.', 'Stand up by driving your hips forward.']),
  d('Sumo Deadlift', 'deadlift', [BB_HAND], ['Wide stance with toes turned out, grip inside your knees.', 'Brace and push your knees out as you stand.', 'Lower with the same path.']),
  d('Good Morning', 'goodMorning', [BB_SHOULDER], ['Bar on your upper back, knees soft.', 'Hinge forward with a flat back to a comfortable depth.', 'Return to standing by squeezing your glutes.']),
  d('Lying Leg Curl', 'lyingLegCurl', [{ kind: 'block', x: 10, y: 68, w: 70, h: 6 }], ['Lie face down with the pad above your heels.', 'Curl your heels toward your glutes.', 'Lower slowly.']),
  d('Seated Leg Curl', 'seatedLegCurl', [SEAT, BACK_PAD], ['Pad behind your lower legs, thigh pad snug.', 'Bend your knees to pull the pad down.', 'Return slowly.']),
  d('Hip Thrust', 'hipThrust', [{ kind: 'block', x: 8, y: 64, w: 20, h: 26 }, { kind: 'barbell', at: 'hip' }], ['Upper back on a bench, feet flat.', 'Drive your hips up until your body is level from shoulders to knees.', 'Lower with control.']),
  d('Glute Bridge', 'bridge', [], ['Lie on your back, knees bent, feet flat.', 'Press through your heels to lift your hips.', 'Pause, then lower slowly.']),
  d('Cable Kickback', 'kickback', [cable(4, 86)], ['Face the machine, holding on for balance.', 'Push the working leg back with a slight knee bend.', 'Return slowly without arching your lower back.']),
  d('Standing Calf Raise', 'calfRaise', [], ['Stand tall with the balls of your feet supported.', 'Rise onto your toes.', 'Lower your heels slowly.']),
  d('Seated Calf Raise', 'calfRaiseSeated', [SEAT], ['Sit with the pad on your thighs.', 'Lift your heels as high as comfortable.', 'Lower slowly.']),
  // Core
  d('Plank', 'plank', [], ['Forearms under your shoulders.', 'Keep your body in a straight line from head to heels.', 'Breathe steadily. Knees down is a good option.']),
  d('Side Plank', 'sidePlank', [], ['Elbow under your shoulder, legs stacked.', 'Lift your hips to make a straight line.', 'Hold and breathe, then switch sides.']),
  d('Crunch', 'crunch', [], ['Lie with knees bent and feet flat.', 'Curl your shoulders off the floor.', 'Lower slowly without pulling on your neck.']),
  d('Sit-Up', 'sitUp', [], ['Lie with knees bent and feet anchored.', 'Curl up all the way to sitting.', 'Lower with control.']),
  d('Hanging Leg Raise', 'legRaiseHanging', [{ kind: 'bar', y: 8, x1: 30, x2: 70 }], ['Hang from a bar with a firm grip.', 'Raise your legs without swinging. Bend your knees to make it easier.', 'Lower slowly.']),
  d('Cable Crunch', 'cableCrunch', [cable(52, -6)], ['Kneel holding the rope by your head.', 'Curl down, bringing your ribs toward your hips.', 'Return slowly.']),
  d('Russian Twist', 'russianTwist', [], ['Sit leaning back with your chest tall.', 'Rotate side to side from your torso.', 'Keep your feet down for an easier version.']),
  d('Ab Wheel Rollout', 'abWheel', [{ kind: 'wheel' }], ['Kneel holding the wheel under your shoulders.', 'Roll forward only as far as you can keep your back flat.', 'Pull back using your core.']),
  // Full body
  d('Kettlebell Swing', 'swing', [KB], ['Hike the kettlebell back between your legs.', 'Snap your hips forward to swing it to chest height.', 'Let it fall back and hinge again.']),
  d('Clean and Press', 'cleanPress', [BB_HAND], ['Lift the bar from the floor to your shoulders in one move.', 'Press it overhead.', 'Lower in stages with control.']),
  d('Thruster', 'thruster', [BB_HAND], ['Front squat with the bar at your shoulders.', 'Drive up and press the bar overhead in one move.', 'Lower the bar to your shoulders as you squat again.']),
  d("Farmer's Carry", 'carry', [DB], ['Hold a heavy weight in each hand.', 'Walk tall with short, steady steps.', 'Keep your shoulders down and back.']),
  d('Burpee', 'burpee', [], ['Squat and place your hands on the floor.', 'Step or jump your feet back to a plank.', 'Return your feet and stand. Add a jump if you like.']),
  // Cardio
  d('Running', 'run', [], ['Run tall with relaxed shoulders.', 'Land softly under your body.', 'Choose a pace that feels right today.']),
  d('Walking', 'walk', [], ['Stand tall and let your arms swing.', 'Roll through each step from heel to toe.', 'Pick a comfortable pace.']),
  d('Hiking', 'walk', [{ kind: 'slope' }], ['Shorten your stride on climbs.', 'Lean slightly into the hill.', 'Take it easy on descents.']),
  d('Cycling', 'bike', [{ kind: 'pedal', center: [50, 68], r: 10 }], ['Adjust the seat so your knee bends slightly at the bottom.', 'Pedal smoothly in circles.', 'Keep your shoulders relaxed.']),
  d('Stationary Bike', 'bike', [{ kind: 'pedal', center: [50, 68], r: 10 }, { kind: 'block', x: 34, y: 52, w: 8, h: 38 }], ['Set the seat to hip height.', 'Pick a resistance you can keep up steadily.', 'Keep a smooth cadence.']),
  d('Swimming', 'swim', [{ kind: 'water' }], ['Keep your body long near the surface.', 'Reach forward, then pull back under your body.', 'Breathe rhythmically.']),
  d('Rowing Machine', 'rowMachine', [{ kind: 'block', x: 20, y: 82, w: 70, h: 3 }], ['Drive with your legs first.', 'Then lean back slightly and pull the handle to your ribs.', 'Return arms, then body, then legs.']),
  d('Elliptical', 'walk', [{ kind: 'block', x: 70, y: 20, w: 4, h: 70 }], ['Stand tall on the pedals.', 'Push and pull the handles smoothly.', 'Adjust resistance to a comfortable effort.']),
  d('Stair Climber', 'stairs', [{ kind: 'block', x: 54, y: 74, w: 20, h: 16 }, { kind: 'block', x: 40, y: 86, w: 14, h: 4 }], ['Stand tall and hold the rails lightly.', 'Press through the whole foot on each step.', 'Choose a steady pace.']),
  d('Jump Rope', 'jumpRope', [{ kind: 'rope' }], ['Turn the rope from your wrists.', 'Make small, quick hops on the balls of your feet.', 'Land softly.']),
  d('HIIT', 'jumpSquat', [], ['Alternate short, hard efforts with recovery.', 'Choose moves you can do safely when tired.', 'Scale intensity to how you feel.']),
  d('Yoga', 'yoga', [], ['Move with your breath.', 'Stay within a comfortable range.', 'Use support or blocks as needed.']),
  d('Pilates', 'pilates', [], ['Breathe steadily and keep your core gently engaged.', 'Move slowly with control.', 'Keep your neck relaxed.']),
];

const BY_NAME = new Map(BUILTIN_EXERCISE_DEMOS.map((demo) => [demo.name.toLowerCase(), demo]));

export function hasBuiltinDemo(name: string): boolean {
  return BY_NAME.has(name.trim().toLowerCase());
}

export interface DemoExerciseInput {
  name: string;
  category?: 'strength' | 'cardio' | string;
  user_id?: string | null;
}

const GENERIC_STRENGTH: ExerciseDemoInfo = d('Exercise', 'squatGoblet', [], [
  'Warm up with a few light practice reps.',
  'Move through a comfortable range with control.',
  'Stop if you feel sharp pain.',
]);
const GENERIC_CARDIO: ExerciseDemoInfo = d('Cardio', 'walk', [], ['Start easy for a few minutes.', 'Settle into a pace you can keep steady.', 'Ease off gradually at the end.']);

/** Built-in demo for a library exercise, or a generic demo (flagged) for custom ones. */
export function getExerciseDemo(exercise: DemoExerciseInput): { demo: ExerciseDemoInfo; pattern: Pattern; generic: boolean } {
  const builtin = exercise.user_id ? undefined : BY_NAME.get(exercise.name.trim().toLowerCase());
  const demo = builtin ?? (exercise.category === 'cardio' ? GENERIC_CARDIO : GENERIC_STRENGTH);
  return { demo, pattern: PATTERNS[demo.pattern], generic: !builtin };
}
