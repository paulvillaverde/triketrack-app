import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import {
  MAXIM_UI_BG_DARK,
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_TEXT_DARK,
} from './homeScreenShared';

type PermissionOnboardingStep = 'phone' | 'location';

type PermissionOnboardingScreenProps = {
  step: 1 | 2;
  title: string;
  description: string;
  kind: PermissionOnboardingStep;
  onContinue: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  isSubmitting?: boolean;
  isDarkMode?: boolean;
};

export function PermissionOnboardingScreen({
  step,
  title,
  description,
  kind,
  onContinue,
  onSkip,
  isSubmitting = false,
  isDarkMode = false,
}: PermissionOnboardingScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: 26 + insets.top,
          paddingBottom: 28 + insets.bottom,
        },
        isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null,
      ]}
    >
      <View style={[styles.topSpacer, { minHeight: 44 + insets.top * 0.2 }]} />

      <View style={styles.heroWrap}>
        {kind === 'phone' ? <PhoneSecurityIllustration /> : <LocationServicesIllustration />}
      </View>

      <View style={styles.copyWrap}>
        <Text style={[styles.title, isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null]}>{title}</Text>
        <Text style={[styles.description, isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
          {description}
        </Text>
      </View>

      <View style={styles.stepRow}>
        {[1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.stepIndicator,
              step === index ? styles.stepIndicatorActive : styles.stepIndicatorInactive,
              isDarkMode && step !== index ? { backgroundColor: MAXIM_UI_BORDER_DARK } : null,
            ]}
          />
        ))}
      </View>

      <Pressable
        style={[styles.skipButton, isSubmitting && styles.actionDisabled]}
        onPress={() => {
          if (!isSubmitting) {
            void onSkip();
          }
        }}
      >
        <Text style={[styles.skipText, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null]}>Skip</Text>
      </Pressable>

      <Pressable
        style={[
          styles.continueButton,
          isSubmitting && styles.continueButtonDisabled,
        ]}
        onPress={() => {
          if (!isSubmitting) {
            void onContinue();
          }
        }}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.continueText}>Continue</Text>
        )}
      </Pressable>
    </View>
  );
}

function PhoneSecurityIllustration() {
  return (
    <View style={styles.illustrationBox}>
      <Svg width={252} height={252} viewBox="0 0 252 252">
        <Circle cx="126" cy="126" r="98" fill="#EAF8F3" />
        <Circle cx="126" cy="126" r="82" fill="#F7FCFA" />
        <Ellipse cx="126" cy="200" rx="50" ry="12" fill="#DCEFE8" />
        <Circle cx="78" cy="92" r="12" fill="#E7F7F1" />
        <Circle cx="176" cy="86" r="8" fill="#E7F7F1" />
        <Circle cx="186" cy="136" r="10" fill="#E7F7F1" />
        <Path
          d="M126 40C158.03 40 184 65.97 184 98V118C184 128.49 179.83 138.56 172.41 145.98L141.2 177.19C132.72 185.67 119.28 185.67 110.8 177.19L79.59 145.98C72.17 138.56 68 128.49 68 118V98C68 65.97 93.97 40 126 40Z"
          fill="#D9F3EA"
        />
        <Rect x="78" y="54" width="96" height="134" rx="30" fill="#E5F7F0" />
        <Rect x="84" y="60" width="84" height="122" rx="24" fill="#FFFFFF" stroke="#57C7A8" strokeWidth="4" />
        <Rect x="112" y="69" width="28" height="5" rx="2.5" fill="#8ECFBD" />
        <Rect x="102" y="159" width="48" height="8" rx="4" fill="#E7F7F1" />
        <Rect x="92" y="173" width="68" height="8" rx="4" fill="#E7F7F1" />
        <Path
          d="M126 92C141.46 92 154 104.54 154 120C154 135.46 141.46 148 126 148C110.54 148 98 135.46 98 120C98 104.54 110.54 92 126 92Z"
          fill="#57C7A8"
        />
        <Path
          d="M126 100C136.49 100 145 108.51 145 119C145 129.49 136.49 138 126 138C115.51 138 107 129.49 107 119C107 108.51 115.51 100 126 100Z"
          fill="#FFFFFF"
          opacity="0.16"
        />
        <Path
          d="M126 109C129.31 109 132 111.69 132 115C132 117.78 130.09 120.13 127.5 120.79V128C127.5 128.83 126.83 129.5 126 129.5C125.17 129.5 124.5 128.83 124.5 128V120.79C121.91 120.13 120 117.78 120 115C120 111.69 122.69 109 126 109Z"
          fill="#FFFFFF"
        />
        <Path
          d="M145 50C156.14 53.61 165.04 62.42 168.76 73.52"
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.52"
        />
      </Svg>
    </View>
  );
}

function LocationServicesIllustration() {
  return (
    <View style={styles.illustrationBox}>
      <Svg width={252} height={252} viewBox="0 0 252 252">
        <Circle cx="126" cy="126" r="98" fill="#EAF8F3" />
        <Circle cx="126" cy="126" r="82" fill="#F7FCFA" />
        <Ellipse cx="126" cy="200" rx="50" ry="12" fill="#DCEFE8" />
        <Circle cx="80" cy="92" r="11" fill="#E7F7F1" />
        <Circle cx="174" cy="88" r="8" fill="#E7F7F1" />
        <Path d="M54 148L95 116L135 154L92 187Z" fill="#E6F5EF" />
        <Path d="M95 116L143 90L186 123L135 154Z" fill="#D9F3EA" />
        <Path d="M70 100L110 77L143 90L95 116Z" fill="#EEF9F5" />
        <Path d="M135 154L186 123L198 156L145 188Z" fill="#EEF9F5" />
        <Path d="M107 95L114 100L92 112L85 107Z" fill="#FFFFFF" opacity="0.85" />
        <Path d="M147 92L154 97L129 111L122 106Z" fill="#FFFFFF" opacity="0.85" />
        <Path d="M161 136L168 141L144 155L137 150Z" fill="#FFFFFF" opacity="0.85" />
        <G>
          <Circle cx="126" cy="126" r="54" fill="none" stroke="#B8E8DA" strokeWidth="2" />
          <Circle cx="126" cy="126" r="38" fill="none" stroke="#9DDEC9" strokeWidth="2.5" />
          <Circle cx="126" cy="126" r="22" fill="none" stroke="#7ED4BA" strokeWidth="3" />
        </G>
        <Path
          d="M126 66C107.5 66 92.5 81.07 92.5 99.66C92.5 122.72 118.48 144.75 124.26 149.39C125.29 150.22 126.71 150.22 127.74 149.39C133.52 144.75 159.5 122.72 159.5 99.66C159.5 81.07 144.5 66 126 66Z"
          fill="#57C7A8"
        />
        <Path
          d="M142 74C149.17 79.16 153.5 87.53 153.5 97.66C153.5 113.63 140.53 128.57 129.37 138.49C137.73 130.1 145 119.39 145 105.83C145 89.8 132.19 76.65 116.04 74.58C123.89 71.52 134.47 71.71 142 74Z"
          fill="#6FD2B8"
          opacity="0.38"
        />
        <Path
          d="M126 80C136.49 80 145 88.51 145 99C145 109.49 136.49 118 126 118C115.51 118 107 109.49 107 99C107 88.51 115.51 80 126 80Z"
          fill="#FFFFFF"
        />
        <Circle cx="126" cy="99" r="7" fill="#57C7A8" opacity="0.82" />
        <Path
          d="M144 74C150.31 77.53 155.37 82.59 158.9 88.9"
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.5"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6FBF8',
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 28,
  },
  topSpacer: {
    minHeight: 44,
  },
  heroWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250,
  },
  illustrationBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  description: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 24,
    color: '#5F6C72',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
    maxWidth: 320,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  stepIndicator: {
    width: 30,
    height: 5,
    borderRadius: 999,
  },
  stepIndicatorActive: {
    backgroundColor: '#57C7A8',
  },
  stepIndicatorInactive: {
    backgroundColor: '#CDEEE4',
  },
  skipButton: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  skipText: {
    fontSize: 18,
    lineHeight: 22,
    color: '#2F7F69',
    fontFamily: 'CircularStdMedium500',
  },
  continueButton: {
    width: '100%',
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: '#57C7A8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  continueButtonDisabled: {
    opacity: 0.75,
  },
  continueText: {
    fontSize: 20,
    lineHeight: 24,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  actionDisabled: {
    opacity: 0.6,
  },
});
