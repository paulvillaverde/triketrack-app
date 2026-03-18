import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TrikeTrackLogo } from '../components/branding';

type GetStartedScreenProps = {
  onGetStarted: () => void;
  styles: Record<string, any>;
};

export function GetStartedScreen({ onGetStarted }: GetStartedScreenProps) {
  return (
    <Pressable style={localStyles.container} onPress={onGetStarted}>
      <TrikeTrackLogo />
      <Text style={localStyles.hint}>Tap anywhere to get started</Text>
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
