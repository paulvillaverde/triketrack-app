import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TrikeTrackLogo } from '../components/branding';
import { MAXIM_UI_BG_DARK, MAXIM_UI_MUTED_DARK } from './homeScreenShared';

type GetStartedScreenProps = {
  onGetStarted: () => void;
  styles: Record<string, any>;
  isDarkMode?: boolean;
};

export function GetStartedScreen({ onGetStarted, isDarkMode = false }: GetStartedScreenProps) {
  return (
    <Pressable
      style={[localStyles.container, isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null]}
      onPress={onGetStarted}
    >
      <TrikeTrackLogo />
      <Text style={[localStyles.hint, isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
        Tap anywhere to get started
      </Text>
    </Pressable>
  );
}

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    marginTop: 22,
    fontSize: 13,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'CircularStdMedium500',
  },
});
