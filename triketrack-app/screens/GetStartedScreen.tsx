import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import {
  MAXIM_UI_BG_DARK,
  MAXIM_UI_MUTED_DARK,
} from './homeScreenShared';

type GetStartedScreenProps = {
  styles: Record<string, any>;
  isDarkMode?: boolean;
  authText?: string;
};

export function GetStartedScreen({ isDarkMode = false, authText }: GetStartedScreenProps) {
  return (
    <View
      style={[localStyles.container, isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null]}
    >
      <View style={localStyles.logoBlock}>
        <Image
          source={require('../assets/logo.png')}
          style={localStyles.logo}
          resizeMode="contain"
        />
      </View>
      {authText ? (
        <View style={localStyles.statusRow}>
          <Text style={[localStyles.authText, isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
            Connecting to service...
          </Text>
          <ActivityIndicator size="small" color={isDarkMode ? '#7CE6C8' : '#147D64'} />
        </View>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 680,
    backgroundColor: '#F7FBFA',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 112,
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logo: {
    width: 246,
    height: 246,
  },
  authText: {
    color: '#768293',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
});
