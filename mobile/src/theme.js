// Praxio theme for mobile: the same charcoal (dark) and creme-beige + white (light) palette
// as the website. Follows the phone's setting unless the person picks one in Profile.
import { createContext, useContext } from 'react';

export const PALETTES = {
  light: {
    bg: '#F2ECE1', surface: '#FFFFFF', surface2: '#EAE2D4', text: '#1C1B19', text2: '#5A554D', text3: '#8C857A',
    line: 'rgba(28,27,25,0.10)', accent: '#2A2826', accentSoft: 'rgba(42,40,38,0.08)', onAccent: '#FBF8F2',
    good: '#237A50', goodSoft: 'rgba(35,122,80,0.10)', warn: '#9A5B00', warnSoft: 'rgba(154,91,0,0.10)',
    bad: '#B23A26', badSoft: 'rgba(178,58,38,0.10)', shadow: '#3C301E', statusBar: 'dark',
  },
  dark: {
    bg: '#161615', surface: '#1F1F1E', surface2: '#2A2A28', text: '#F1EEE8', text2: '#A9A59E', text3: '#75726C',
    line: 'rgba(255,255,255,0.08)', accent: '#E9DFCC', accentSoft: 'rgba(233,223,204,0.10)', onAccent: '#161615',
    good: '#5BC79A', goodSoft: 'rgba(91,199,154,0.12)', warn: '#E2A84B', warnSoft: 'rgba(226,168,75,0.12)',
    bad: '#F08A75', badSoft: 'rgba(240,138,117,0.12)', shadow: '#000000', statusBar: 'light',
  },
};

export const FONTS = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  serif: 'InstrumentSerif_400Regular_Italic',
};

export const ThemeContext = createContext({ c: PALETTES.dark, mode: 'system', setMode: () => {}, fontsReady: false });
export const useTheme = () => useContext(ThemeContext);

/**
 * Text style for a font weight. Until the fonts load (or if they fail) this falls back to the
 * system font: never a guessed family name, which iOS treats as an error.
 */
export function font(t, kind = 'regular') {
  if (t.fontsReady) return { fontFamily: FONTS[kind] };
  const weight = { regular: '400', medium: '500', semibold: '600', bold: '700', serif: '400' }[kind];
  return kind === 'serif' ? { fontStyle: 'italic', fontWeight: weight } : { fontWeight: weight };
}
