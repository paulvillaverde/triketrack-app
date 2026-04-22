import { Modal, Pressable, Text, View } from 'react-native';
import { profileModalStyles } from './profileModalStyles';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../../screens/homeScreenShared';

type SupportModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onClose: () => void;
  isLowBatteryMapMode?: boolean;
};

export function SupportModal({
  visible,
  onRequestClose,
  onClose,
  isLowBatteryMapMode = false,
}: SupportModalProps) {
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
            Support
          </Text>
          <Text
            style={[
              profileModalStyles.infoText,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            For technical issues, contact the operations desk or support team.
          </Text>
          <Text
            style={[
              profileModalStyles.infoText,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            Hotline: 0917-123-4567
          </Text>
          <Text
            style={[
              profileModalStyles.infoText,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            Email: support@triketrack.app
          </Text>
          <Pressable style={profileModalStyles.modalPrimaryButton} onPress={onClose}>
            <Text style={profileModalStyles.modalPrimaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
