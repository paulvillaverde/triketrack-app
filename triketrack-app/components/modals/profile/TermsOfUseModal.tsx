import { Modal, Pressable, Text, View } from 'react-native';
import { profileModalStyles } from './profileModalStyles';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../../screens/homeScreenShared';

type TermsOfUseModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onClose: () => void;
  isLowBatteryMapMode?: boolean;
};

export function TermsOfUseModal({
  visible,
  onRequestClose,
  onClose,
  isLowBatteryMapMode = false,
}: TermsOfUseModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={profileModalStyles.modalOverlay}>
        <View
          style={[
            profileModalStyles.infoModalCard,
            isLowBatteryMapMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_DARK,
                  borderColor: MAXIM_UI_BORDER_DARK,
                }
              : null,
          ]}
        >
          <Text
            style={[
              profileModalStyles.modalTitle,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
          >
            Terms of use
          </Text>
          <Text
            style={[
              profileModalStyles.infoText,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            By using TrikeTrack, drivers agree to follow route compliance policies, maintain valid
            documents, and submit accurate trip logs. Repeated violations may result in account
            restrictions based on operator rules.
          </Text>
          <Pressable style={profileModalStyles.modalPrimaryButton} onPress={onClose}>
            <Text style={profileModalStyles.modalPrimaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
