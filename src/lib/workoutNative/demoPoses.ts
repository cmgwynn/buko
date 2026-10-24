/**
 * Original schematic stick-figure poses drawn for Buko (viewBox 0 -8 100 106, floor at y = 90).
 * Side views face right. Front views list only the figure's left-of-screen side; the renderer mirrors it.
 */
export type Pt = readonly [number, number];

export interface Pose {
  head: Pt;
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
  hip: Pt;
  knee: Pt;
  foot: Pt;
  /** Far-side limbs (side view) drawn lighter. */
  elbow2?: Pt;
  hand2?: Pt;
  knee2?: Pt;
  foot2?: Pt;
  /** Toe tip for heel-raise style moves; otherwise a flat foot is drawn when the foot is on the floor. */
  toe?: Pt;
}

export type Prop =
  | { kind: 'barbell'; at: 'hand' | 'shoulder' | 'hip' }
  | { kind: 'dumbbell' }
  | { kind: 'kettlebell' }
  | { kind: 'cable'; anchor: Pt }
  | { kind: 'block'; x: number; y: number; w: number; h: number; label?: string }
  | { kind: 'bar'; y: number; x1: number; x2: number }
  | { kind: 'wheel' }
  | { kind: 'pedal'; center: Pt; r: number }
  | { kind: 'water' }
  | { kind: 'slope' }
  | { kind: 'rope' };

export interface Pattern {
  view: 'side' | 'front';
  frames: readonly [Pose, Pose];
  labels: readonly [string, string];
}

interface Body {
  head: Pt;
  shoulder: Pt;
  hip: Pt;
  knee: Pt;
  foot: Pt;
  knee2?: Pt;
  foot2?: Pt;
  toe?: Pt;
}
interface Arm {
  elbow: Pt;
  hand: Pt;
}

const at = (base: Pt, d: Pt): Pt => [base[0] + d[0], base[1] + d[1]];
const shift = (b: Body, dx: number, dy: number): Body => {
  const m = (p?: Pt) => (p ? ([p[0] + dx, p[1] + dy] as Pt) : undefined);
  return { head: m(b.head)!, shoulder: m(b.shoulder)!, hip: m(b.hip)!, knee: m(b.knee)!, foot: m(b.foot)!, knee2: m(b.knee2), foot2: m(b.foot2), toe: m(b.toe) };
};

function pose(body: Body, arm: Arm, arm2?: Arm): Pose {
  const out: Pose = { ...body, elbow: at(body.shoulder, arm.elbow), hand: at(body.shoulder, arm.hand) };
  if (arm2) {
    out.elbow2 = at(body.shoulder, arm2.elbow);
    out.hand2 = at(body.shoulder, arm2.hand);
  }
  for (const k of ['knee2', 'foot2', 'toe'] as const) if (out[k] === undefined) delete out[k];
  return out;
}

const arm = (elbow: Pt, hand: Pt): Arm => ({ elbow, hand });

// Arms, relative to the shoulder.
const DOWN = arm([0, 14], [0, 27]);
const FORWARD = arm([13, 0], [26, 0]);
const UP = arm([0, -13], [0, -26]);
const RACK = arm([6, 10], [9, 0]);
const BACK_BAR = arm([-8, 6], [-3, -2]);
const CHEST = arm([6, 12], [12, 4]);
const CROSSED = arm([8, 6], [12, 0]);
const PRESS_LOW = arm([2, 12], [6, -1]);
const CURL_TOP = arm([0, 14], [9, 4]);

// Bodies.
const STAND: Body = { head: [50, 13], shoulder: [50, 24], hip: [50, 52], knee: [50, 71], foot: [50, 90] };
const SQUAT: Body = { head: [57, 32], shoulder: [53, 42], hip: [36, 63], knee: [57, 69], foot: [50, 90] };
const HINGE: Body = { head: [73, 35], shoulder: [65, 40], hip: [42, 52], knee: [47, 71], foot: [48, 90] };
const HINGE_LOW: Body = { head: [67, 36], shoulder: [61, 44], hip: [40, 60], knee: [55, 70], foot: [49, 90] };
const SEATED: Body = { head: [42, 30], shoulder: [42, 41], hip: [42, 66], knee: [62, 66], foot: [62, 90] };
const LYING_BENCH: Body = { head: [20, 57], shoulder: [28, 59], hip: [55, 59], knee: [70, 64], foot: [74, 90] };
const INCLINE: Body = { head: [26, 37], shoulder: [32, 45], hip: [50, 66], knee: [66, 64], foot: [72, 90] };
const PLANK_HIGH: Body = { head: [79, 59], shoulder: [70, 63], hip: [46, 74], knee: [31, 82], foot: [16, 89] };
const PLANK_LOW: Body = { head: [80, 77], shoulder: [70, 80], hip: [46, 84], knee: [31, 87], foot: [16, 89] };
const FOREARM_PLANK: Body = { head: [80, 70], shoulder: [70, 74], hip: [46, 79], knee: [31, 84], foot: [16, 89] };
const HANG: Body = { head: [51, 16], shoulder: [50, 27], hip: [50, 55], knee: [50, 72], foot: [50, 88] };
const HANG_TOP: Body = { head: [53, 2], shoulder: [50, 14], hip: [50, 42], knee: [50, 59], foot: [50, 75] };
const LUNGE_LOW: Body = { head: [48, 26], shoulder: [48, 37], hip: [48, 65], knee: [64, 72], foot: [64, 90], knee2: [38, 88], foot2: [24, 89] };
const SPLIT: Body = { head: [48, 15], shoulder: [48, 26], hip: [48, 54], knee: [58, 72], foot: [62, 90], knee2: [40, 71], foot2: [32, 89] };
const FLOOR: Body = { head: [16, 83], shoulder: [25, 86], hip: [50, 86], knee: [62, 72], foot: [72, 89] };
const CRUNCH_UP: Body = { head: [30, 70], shoulder: [35, 77], hip: [50, 86], knee: [62, 72], foot: [72, 89] };
const SITUP_UP: Body = { head: [60, 53], shoulder: [57, 64], hip: [50, 86], knee: [62, 72], foot: [72, 89] };
const BRIDGE_UP: Body = { head: [16, 83], shoulder: [25, 86], hip: [50, 72], knee: [64, 70], foot: [72, 89] };
const KNEEL: Body = { head: [54, 28], shoulder: [52, 39], hip: [50, 66], knee: [50, 89], foot: [30, 89] };

export const PATTERNS = {
  squatBackBar: { view: 'side', frames: [pose(STAND, BACK_BAR), pose(SQUAT, BACK_BAR)], labels: ['Start', 'Bottom'] },
  squatFront: { view: 'side', frames: [pose(STAND, RACK), pose(SQUAT, RACK)], labels: ['Start', 'Bottom'] },
  squatGoblet: { view: 'side', frames: [pose(STAND, CHEST), pose(SQUAT, CHEST)], labels: ['Start', 'Bottom'] },
  thruster: { view: 'side', frames: [pose(SQUAT, RACK), pose(STAND, UP)], labels: ['Bottom', 'Press'] },
  jumpSquat: { view: 'side', frames: [pose(SQUAT, arm([-6, 10], [-10, 20])), pose(shift(STAND, 0, -6), arm([-4, -12], [-6, -22]))], labels: ['Load', 'Jump'] },
  legPress: {
    view: 'side',
    frames: [
      pose({ head: [22, 40], shoulder: [28, 48], hip: [44, 70], knee: [52, 49], foot: [66, 56] }, arm([6, 10], [10, 20])),
      pose({ head: [22, 40], shoulder: [28, 48], hip: [44, 70], knee: [62, 59], foot: [80, 49] }, arm([6, 10], [10, 20])),
    ],
    labels: ['Lowered', 'Pressed'],
  },
  deadlift: { view: 'side', frames: [pose(HINGE_LOW, DOWN), pose(STAND, DOWN)], labels: ['Set up', 'Stand tall'] },
  hinge: { view: 'side', frames: [pose(STAND, DOWN), pose(HINGE, arm([1, 13], [2, 26]))], labels: ['Stand', 'Hinge'] },
  goodMorning: { view: 'side', frames: [pose(STAND, BACK_BAR), pose(HINGE, BACK_BAR)], labels: ['Stand', 'Hinge'] },
  swing: { view: 'side', frames: [pose(HINGE, arm([-2, 13], [-8, 24])), pose(STAND, FORWARD)], labels: ['Hike back', 'Snap tall'] },
  cleanPress: { view: 'side', frames: [pose(HINGE_LOW, DOWN), pose(STAND, UP)], labels: ['Set up', 'Overhead'] },
  backExtension: {
    view: 'side',
    frames: [
      pose({ head: [64, 82], shoulder: [60, 72], hip: [48, 52], knee: [34, 62], foot: [20, 72] }, CROSSED),
      pose({ head: [79, 37], shoulder: [70, 42], hip: [48, 52], knee: [34, 62], foot: [20, 72] }, CROSSED),
    ],
    labels: ['Lowered', 'Level'],
  },
  benchPress: { view: 'side', frames: [pose(LYING_BENCH, arm([-5, 6], [1, -6])), pose(LYING_BENCH, arm([1, -13], [2, -26]))], labels: ['Lowered', 'Pressed'] },
  inclinePress: { view: 'side', frames: [pose(INCLINE, arm([-3, 9], [5, -3])), pose(INCLINE, arm([8, -10], [16, -21]))], labels: ['Lowered', 'Pressed'] },
  flyLying: { view: 'side', frames: [pose(LYING_BENCH, arm([1, -13], [2, -26])), pose(LYING_BENCH, arm([4, -4], [10, -2]))], labels: ['Arms over chest', 'Open wide'] },
  skullCrusher: { view: 'side', frames: [pose(LYING_BENCH, arm([1, -13], [2, -26])), pose(LYING_BENCH, arm([1, -13], [-9, -7]))], labels: ['Arms up', 'Elbows bent'] },
  seatedPress: { view: 'side', frames: [pose(SEATED, arm([-3, 9], [7, 2])), pose(SEATED, FORWARD)], labels: ['Handles at chest', 'Pressed'] },
  flyFront: {
    view: 'front',
    frames: [
      pose({ head: [50, 13], shoulder: [60, 24], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([12, 3], [24, 6])),
      pose({ head: [50, 13], shoulder: [60, 24], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([5, 8], [-4, 10])),
    ],
    labels: ['Arms open', 'Hug in'],
  },
  pushUp: { view: 'side', frames: [pose(PLANK_HIGH, arm([0, 13], [0, 26])), pose(PLANK_LOW, arm([-9, -4], [-2, 9]))], labels: ['Top', 'Lowered'] },
  burpee: { view: 'side', frames: [pose(STAND, DOWN), pose(PLANK_HIGH, arm([0, 13], [0, 26]))], labels: ['Stand', 'Plank'] },
  dip: {
    view: 'side',
    frames: [
      pose({ head: [52, 18], shoulder: [50, 29], hip: [48, 56], knee: [56, 70], foot: [46, 78] }, arm([0, 13], [0, 27])),
      pose({ head: [55, 29], shoulder: [52, 40], hip: [47, 66], knee: [55, 80], foot: [45, 87] }, arm([-10, 6], [-2, 16])),
    ],
    labels: ['Top', 'Lowered'],
  },
  benchDip: {
    view: 'side',
    frames: [
      pose({ head: [44, 28], shoulder: [42, 39], hip: [44, 62], knee: [64, 70], foot: [84, 89] }, arm([-4, 11], [-6, 23])),
      pose({ head: [44, 40], shoulder: [42, 51], hip: [44, 74], knee: [64, 78], foot: [84, 89] }, arm([-14, 4], [-6, 11])),
    ],
    labels: ['Top', 'Lowered'],
  },
  pressStanding: { view: 'side', frames: [pose(STAND, PRESS_LOW), pose(STAND, UP)], labels: ['At shoulders', 'Overhead'] },
  pressSeated: { view: 'side', frames: [pose(SEATED, PRESS_LOW), pose(SEATED, UP)], labels: ['At shoulders', 'Overhead'] },
  overheadExtension: { view: 'side', frames: [pose(STAND, arm([3, -13], [-7, -4])), pose(STAND, UP)], labels: ['Behind head', 'Extended'] },
  bentRow: { view: 'side', frames: [pose(HINGE, arm([1, 13], [2, 26])), pose(HINGE, arm([-11, -2], [-6, 11]))], labels: ['Arms long', 'Row'] },
  seatedRow: {
    view: 'side',
    frames: [
      pose({ head: [46, 34], shoulder: [44, 45], hip: [38, 72], knee: [54, 64], foot: [70, 72] }, FORWARD),
      pose({ head: [42, 34], shoulder: [40, 45], hip: [38, 72], knee: [54, 64], foot: [70, 72] }, arm([-9, 9], [5, 12])),
    ],
    labels: ['Reach', 'Pull'],
  },
  facePull: { view: 'side', frames: [pose(STAND, arm([13, -2], [26, -4])), pose(STAND, arm([-5, -4], [8, -10]))], labels: ['Reach', 'To face'] },
  pullUp: { view: 'side', frames: [pose(HANG, arm([0, -10], [0, -19])), pose(HANG_TOP, arm([-6, 8], [0, -6]))], labels: ['Hang', 'Chin over bar'] },
  latPulldown: { view: 'side', frames: [pose(SEATED, arm([2, -13], [4, -26])), pose(SEATED, arm([-5, 10], [6, 0]))], labels: ['Arms up', 'Pull down'] },
  straightArmPulldown: {
    view: 'side',
    frames: [
      pose({ head: [56, 15], shoulder: [53, 26], hip: [46, 53], knee: [48, 71], foot: [48, 90] }, arm([10, -8], [20, -16])),
      pose({ head: [56, 15], shoulder: [53, 26], hip: [46, 53], knee: [48, 71], foot: [48, 90] }, arm([3, 13], [6, 26])),
    ],
    labels: ['Arms up', 'To thighs'],
  },
  legRaiseHanging: {
    view: 'side',
    frames: [pose(HANG, arm([0, -10], [0, -19])), pose({ ...HANG, knee: [68, 55], foot: [86, 55] }, arm([0, -10], [0, -19]))],
    labels: ['Hang', 'Legs up'],
  },
  curl: { view: 'side', frames: [pose(STAND, DOWN), pose(STAND, CURL_TOP)], labels: ['Arms long', 'Curl'] },
  preacherCurl: { view: 'side', frames: [pose(SEATED, arm([10, 10], [22, 20])), pose(SEATED, arm([10, 10], [12, -3]))], labels: ['Arm long', 'Curl'] },
  inclineCurl: { view: 'side', frames: [pose(INCLINE, arm([-2, 13], [-3, 26])), pose(INCLINE, arm([-2, 13], [8, 4]))], labels: ['Arms hang', 'Curl'] },
  pushdown: { view: 'side', frames: [pose(STAND, arm([0, 14], [11, 6])), pose(STAND, arm([0, 14], [3, 27]))], labels: ['Elbows bent', 'Pushed down'] },
  lateralRaise: {
    view: 'front',
    frames: [
      pose({ head: [50, 13], shoulder: [60, 24], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([2, 14], [3, 27])),
      pose({ head: [50, 13], shoulder: [60, 24], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([13, 2], [26, 3])),
    ],
    labels: ['Arms down', 'Raise to sides'],
  },
  frontRaise: { view: 'side', frames: [pose(STAND, DOWN), pose(STAND, FORWARD)], labels: ['Arms down', 'Raise forward'] },
  rearDeltFly: { view: 'side', frames: [pose(HINGE, arm([1, 13], [2, 26])), pose(HINGE, arm([-3, 7], [-6, 5]))], labels: ['Arms hang', 'Open out'] },
  uprightRow: {
    view: 'front',
    frames: [
      pose({ head: [50, 13], shoulder: [60, 24], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([2, 14], [-4, 26])),
      pose({ head: [50, 13], shoulder: [60, 24], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([11, -2], [-4, 6])),
    ],
    labels: ['Bar low', 'Elbows high'],
  },
  shrug: {
    view: 'front',
    frames: [
      pose({ head: [50, 13], shoulder: [60, 25], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([2, 14], [3, 27])),
      pose({ head: [50, 13], shoulder: [60, 21], hip: [56, 52], knee: [57, 71], foot: [58, 90] }, arm([2, 14], [3, 27])),
    ],
    labels: ['Relaxed', 'Shrug up'],
  },
  lunge: { view: 'side', frames: [pose(STAND, DOWN), pose(LUNGE_LOW, DOWN)], labels: ['Stand', 'Lunge'] },
  splitSquat: {
    view: 'side',
    frames: [
      pose({ ...SPLIT, knee2: [38, 66], foot2: [26, 64] }, DOWN),
      pose({ head: [48, 27], shoulder: [48, 38], hip: [48, 66], knee: [64, 72], foot: [62, 90], knee2: [38, 84], foot2: [26, 64] }, DOWN),
    ],
    labels: ['Rear foot up', 'Lowered'],
  },
  stepUp: {
    view: 'side',
    frames: [
      pose({ head: [46, 13], shoulder: [46, 24], hip: [46, 52], knee: [60, 62], foot: [62, 78], knee2: [44, 71], foot2: [42, 89] }, DOWN),
      pose({ head: [60, 1], shoulder: [60, 12], hip: [60, 40], knee: [61, 59], foot: [62, 78], knee2: [58, 58], foot2: [56, 70] }, DOWN),
    ],
    labels: ['Foot on step', 'Stand up'],
  },
  legExtension: { view: 'side', frames: [pose(SEATED, arm([2, 13], [4, 25])), pose({ ...SEATED, foot: [82, 62] }, arm([2, 13], [4, 25]))], labels: ['Knees bent', 'Legs straight'] },
  lyingLegCurl: {
    view: 'side',
    frames: [
      pose({ head: [16, 62], shoulder: [24, 66], hip: [50, 66], knee: [70, 66], foot: [88, 66] }, arm([-6, 6], [-12, 2])),
      pose({ head: [16, 62], shoulder: [24, 66], hip: [50, 66], knee: [70, 66], foot: [76, 48] }, arm([-6, 6], [-12, 2])),
    ],
    labels: ['Legs long', 'Curl'],
  },
  seatedLegCurl: {
    view: 'side',
    frames: [pose({ ...SEATED, knee: [62, 64], foot: [82, 64] }, arm([2, 13], [4, 25])), pose({ ...SEATED, knee: [62, 64], foot: [60, 84] }, arm([2, 13], [4, 25]))],
    labels: ['Legs long', 'Curl'],
  },
  hipThrust: {
    view: 'side',
    frames: [
      pose({ head: [18, 56], shoulder: [26, 62], hip: [44, 80], knee: [60, 66], foot: [66, 89] }, arm([8, 12], [18, 16])),
      pose({ head: [18, 56], shoulder: [26, 62], hip: [46, 62], knee: [62, 62], foot: [66, 89] }, arm([8, 4], [20, 0])),
    ],
    labels: ['Hips low', 'Hips up'],
  },
  bridge: { view: 'side', frames: [pose(FLOOR, arm([10, 3], [20, 3])), pose(BRIDGE_UP, arm([10, 3], [20, 3]))], labels: ['Hips down', 'Hips up'] },
  kickback: {
    view: 'side',
    frames: [
      pose({ ...HINGE, head: [64, 22], shoulder: [58, 30], hip: [46, 54], knee2: [47, 71], foot2: [48, 90] }, FORWARD),
      pose({ ...HINGE, head: [64, 22], shoulder: [58, 30], hip: [46, 54], knee2: [34, 68], foot2: [22, 80] }, FORWARD),
    ],
    labels: ['Leg under hip', 'Kick back'],
  },
  calfRaise: { view: 'side', frames: [pose(STAND, DOWN), pose({ ...shift(STAND, 0, -5), foot: [50, 85], toe: [57, 89] }, DOWN)], labels: ['Heels down', 'Heels up'] },
  calfRaiseSeated: { view: 'side', frames: [pose(SEATED, CROSSED), pose({ ...SEATED, knee: [62, 61], foot: [62, 85], toe: [69, 89] }, CROSSED)], labels: ['Heels down', 'Heels up'] },
  plank: {
    view: 'side',
    frames: [
      pose({ ...FOREARM_PLANK, hip: [44, 82], knee: [33, 89], foot: [16, 89] }, arm([0, 15], [10, 15])),
      pose(FOREARM_PLANK, arm([0, 15], [10, 15])),
    ],
    labels: ['Set up', 'Hold'],
  },
  sidePlank: {
    view: 'side',
    frames: [
      pose({ head: [24, 64], shoulder: [32, 72], hip: [56, 86], knee: [68, 88], foot: [82, 89] }, arm([0, 17], [8, 17]), arm([6, -8], [10, -16])),
      pose({ head: [24, 64], shoulder: [32, 72], hip: [56, 78], knee: [68, 83], foot: [82, 89] }, arm([0, 17], [8, 17]), arm([0, -13], [0, -26])),
    ],
    labels: ['Set up', 'Hips lifted'],
  },
  crunch: { view: 'side', frames: [pose(FLOOR, arm([8, -5], [14, -2])), pose(CRUNCH_UP, arm([8, -3], [14, 1]))], labels: ['Lying', 'Curl up'] },
  sitUp: { view: 'side', frames: [pose(FLOOR, arm([8, -5], [14, -2])), pose(SITUP_UP, arm([8, 5], [12, 0]))], labels: ['Lying', 'Sit up'] },
  cableCrunch: {
    view: 'side',
    frames: [
      pose(KNEEL, arm([6, -6], [6, -12])),
      pose({ head: [70, 70], shoulder: [64, 62], hip: [50, 66], knee: [50, 89], foot: [30, 89] }, arm([4, -8], [8, 0])),
    ],
    labels: ['Tall', 'Crunch'],
  },
  russianTwist: {
    view: 'side',
    frames: [
      pose({ head: [36, 55], shoulder: [40, 65], hip: [50, 86], knee: [62, 74], foot: [74, 80] }, arm([8, 6], [16, 4])),
      pose({ head: [36, 55], shoulder: [40, 65], hip: [50, 86], knee: [62, 74], foot: [74, 80] }, arm([4, 10], [8, 18])),
    ],
    labels: ['Lean back', 'Rotate'],
  },
  abWheel: {
    view: 'side',
    frames: [
      pose({ head: [70, 55], shoulder: [62, 60], hip: [44, 70], knee: [40, 89], foot: [22, 89] }, arm([1, 15], [2, 27])),
      pose({ head: [86, 78], shoulder: [76, 81], hip: [54, 82], knee: [40, 89], foot: [22, 89] }, arm([10, 3], [20, 6])),
    ],
    labels: ['Kneel', 'Roll out'],
  },
  carry: {
    view: 'side',
    frames: [
      pose({ ...STAND, knee: [55, 71], foot: [57, 90], knee2: [46, 71], foot2: [42, 89] }, DOWN),
      pose({ ...STAND, knee: [46, 71], foot: [42, 89], knee2: [55, 71], foot2: [57, 90] }, DOWN),
    ],
    labels: ['Walk tall', 'Keep going'],
  },
  run: {
    view: 'side',
    frames: [
      pose({ head: [57, 13], shoulder: [54, 24], hip: [50, 51], knee: [64, 62], foot: [58, 80], knee2: [44, 69], foot2: [32, 86] }, arm([-6, 12], [4, 19]), arm([6, 11], [14, 4])),
      pose({ head: [57, 15], shoulder: [54, 26], hip: [50, 53], knee: [44, 71], foot: [32, 86], knee2: [64, 64], foot2: [58, 82] }, arm([6, 11], [14, 4]), arm([-6, 12], [4, 19])),
    ],
    labels: ['Stride', 'Stride'],
  },
  walk: {
    view: 'side',
    frames: [
      pose({ ...STAND, knee: [55, 71], foot: [60, 89], knee2: [46, 71], foot2: [40, 89] }, arm([3, 14], [7, 26]), arm([-3, 14], [-6, 26])),
      pose({ ...STAND, knee: [46, 71], foot: [40, 89], knee2: [55, 71], foot2: [60, 89] }, arm([-3, 14], [-6, 26]), arm([3, 14], [7, 26])),
    ],
    labels: ['Step', 'Step'],
  },
  bike: {
    view: 'side',
    frames: [
      pose({ head: [64, 26], shoulder: [57, 34], hip: [38, 50], knee: [56, 57], foot: [54, 76], knee2: [50, 64], foot2: [48, 70] }, arm([7, 8], [16, 14])),
      pose({ head: [64, 26], shoulder: [57, 34], hip: [38, 50], knee: [52, 46], foot: [58, 66], knee2: [52, 66], foot2: [44, 80] }, arm([7, 8], [16, 14])),
    ],
    labels: ['Pedal', 'Pedal'],
  },
  rowMachine: {
    view: 'side',
    frames: [
      pose({ head: [53, 47], shoulder: [48, 57], hip: [40, 80], knee: [53, 63], foot: [64, 80] }, arm([7, 4], [15, 6])),
      pose({ head: [22, 47], shoulder: [27, 57], hip: [32, 80], knee: [48, 78], foot: [64, 80] }, arm([-5, 10], [7, 9])),
    ],
    labels: ['Catch', 'Finish'],
  },
  stairs: {
    view: 'side',
    frames: [
      pose({ head: [52, 9], shoulder: [51, 20], hip: [50, 48], knee: [61, 58], foot: [60, 74], knee2: [48, 68], foot2: [46, 86] }, arm([3, 13], [8, 24])),
      pose({ head: [52, 5], shoulder: [51, 16], hip: [50, 44], knee: [52, 62], foot: [60, 74], knee2: [58, 56], foot2: [52, 66] }, arm([3, 13], [8, 24])),
    ],
    labels: ['Step', 'Drive up'],
  },
  swim: {
    view: 'side',
    frames: [
      pose({ head: [82, 52], shoulder: [72, 55], hip: [46, 57], knee: [32, 55], foot: [18, 57] }, arm([12, -2], [25, -2]), arm([-10, 6], [-22, 6])),
      pose({ head: [82, 52], shoulder: [72, 55], hip: [46, 57], knee: [32, 59], foot: [18, 55] }, arm([-10, 6], [-22, 6]), arm([12, -2], [25, -2])),
    ],
    labels: ['Reach', 'Pull'],
  },
  jumpRope: {
    view: 'front',
    frames: [
      pose({ head: [50, 13], shoulder: [60, 24], hip: [56, 52], knee: [57, 71], foot: [57, 89] }, arm([4, 12], [12, 20])),
      pose({ head: [50, 7], shoulder: [60, 18], hip: [56, 46], knee: [57, 65], foot: [57, 82] }, arm([4, 12], [12, 20])),
    ],
    labels: ['Land softly', 'Small hop'],
  },
  yoga: {
    view: 'side',
    frames: [pose(STAND, arm([7, 9], [10, 3])), pose({ ...LUNGE_LOW, knee2: [36, 76], foot2: [20, 89] }, UP)],
    labels: ['Mountain', 'Warrior'],
  },
  pilates: {
    view: 'side',
    frames: [pose(FLOOR, arm([12, 2], [24, 3])), pose({ head: [24, 74], shoulder: [30, 80], hip: [50, 86], knee: [64, 74], foot: [80, 64] }, arm([12, 3], [24, 4]))],
    labels: ['Lying', 'Curl and reach'],
  },
} satisfies Record<string, Pattern>;

export type PatternKey = keyof typeof PATTERNS;
