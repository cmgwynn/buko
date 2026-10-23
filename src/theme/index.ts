export const colors = {
  background: '#F3F5F7',
  surface: '#FFFFFF',
  surfaceMuted: '#E9EDF0',
  border: '#E1E7E9',
  text: '#182923',
  textMuted: '#596B63',
  primary: '#356A55',
  primaryPressed: '#285340',
  primarySoft: '#E5F1E9',
  onPrimary: '#FFFFFF',
  danger: '#C2503F',
  dangerSoft: '#F8E6E2',
  warning: '#B7791F',
  warningSoft: '#FAF0DC',

  // Health score ratings (see src/lib/scoring/config.ts for the bands)
  score: {
    excellent: '#3E9B6A',
    good: '#8DB255',
    mediocre: '#E0A13A',
    poor: '#D2604F',
    unknown: '#9AA39E',
  },

  macro: {
    calories: '#356A55',
    protein: '#6C8EBF',
    carbs: '#E0A13A',
    fat: '#C98B7A',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const layout = { appMaxWidth: 1040, contentMaxWidth: 880, formMaxWidth: 520 } as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const typography = {
  title: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.text },
  subheading: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
};

export const shadow = {
  card: {
    shadowColor: '#1F2A26',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
};

export const theme = { colors, spacing, radius, typography, shadow };
export type Theme = typeof theme;
