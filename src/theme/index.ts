export const colors = {
  background: '#F4F3EE',
  surface: '#FFFFFF',
  surfaceMuted: '#EEECE6',
  border: '#DAD7CD',
  text: '#344E41',
  textMuted: '#5E6B60',
  brandBrown: '#684632',
  primary: '#4E7450',
  primaryPressed: '#3A5A40',
  primarySoft: '#EDF1E6',
  onPrimary: '#FFFFFF',
  danger: '#C2503F',
  dangerSoft: '#F8E6E2',
  warning: '#B7791F',
  warningSoft: '#FAF0DC',

  // "Sage Minimal" (Coolors dad7cd · a3b18a · 588157 · 3a5a40 · 344e41), shades tuned for WCAG AA contrast.
  hero: '#344E41',
  heroRaised: '#3A5A40',
  onHero: '#F4F3EE',
  onHeroMuted: 'rgba(244, 243, 238, 0.78)',
  heroTrack: 'rgba(244, 243, 238, 0.18)',
  heroAccent: '#B9C4A4',
  heroDanger: '#F4B3A5',

  // Health score ratings (see src/lib/scoring/config.ts for the bands)
  score: {
    excellent: '#3E9B6A',
    good: '#8DB255',
    mediocre: '#E0A13A',
    poor: '#D2604F',
    unknown: '#9AA39E',
  },

  macro: {
    calories: '#588157',
    protein: '#6C8EBF',
    carbs: '#E0A13A',
    fat: '#C98B7A',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const layout = { appMaxWidth: 1040, contentMaxWidth: 880, formMaxWidth: 520 } as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const typography = {
  display: { fontSize: 52, fontWeight: '800' as const, letterSpacing: -2, lineHeight: 56, fontVariant: ['tabular-nums' as const], color: colors.text },
  eyebrow: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const, color: colors.textMuted },
  title: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.text },
  subheading: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
};

export const shadow = {
  card: {
    shadowColor: '#344E41',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  elevated: {
    shadowColor: '#344E41',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
};

export const theme = { colors, spacing, radius, typography, shadow };
export type Theme = typeof theme;
