import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

/** Original temporary Buko mark: a young coconut with a leaf and a cut white rim. */
export function CoconutLogo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Buko coconut" accessibilityRole="image">
      <Path d="M55 23C59 8 76 6 85 12C79 25 67 28 55 23Z" fill="#356A55" />
      <Path d="M49 29C47 22 48 17 51 13" stroke="#684632" strokeWidth="5" strokeLinecap="round" />
      <Path d="M20 43C19 29 33 22 50 22C67 22 81 30 80 44L77 70C75 85 63 94 50 94C36 94 24 85 22 70Z" fill="#B88A60" />
      <Path d="M24 49C27 72 34 85 47 90C30 90 23 80 22 67Z" fill="#946A45" />
      <Ellipse cx="50" cy="40" rx="30" ry="19" fill="#684632" />
      <Ellipse cx="50" cy="38" rx="26" ry="15" fill="#FFF9E9" />
      <Ellipse cx="50" cy="38" rx="19" ry="10" fill="#DCEBCB" />
      <Circle cx="44" cy="36" r="2.5" fill="#684632" />
      <Circle cx="55" cy="36" r="2.5" fill="#684632" />
      <Path d="M46 43Q50 46 54 43" stroke="#684632" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Svg>
  );
}
