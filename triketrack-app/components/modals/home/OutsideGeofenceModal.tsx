import { Modal, Pressable, Text, View } from 'react-native';
import { homeModalStyles } from './homeModalStyles';
import { AppIcon } from '../../ui';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../../screens/homeScreenShared';

type OutsideGeofenceModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onAcknowledge: () => void;
  isLowBatteryMapMode?: boolean;
};

export function OutsideGeofenceModal({
  visible,
  onRequestClose,
  onAcknowledge,
  isLowBatteryMapMode = false,
}: OutsideGeofenceModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={homeModalStyles.modalBackdrop}>
        <View
          style={[
            homeModalStyles.modalCard,
            isLowBatteryMapMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_DARK,
                  borderColor: MAXIM_UI_BORDER_DARK,
                  shadowOpacity: 0,
                  elevation: 0,
                }
              : null,
          ]}
        >
          <View style={[homeModalStyles.modalIconWrap, homeModalStyles.modalIconWarnWrap]}>
            <AppIcon name="alert-triangle" size={20} color="#B45309" />
          </View>
          <Text
            style={[
              homeModalStyles.modalTitle,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
          >
            Outside Geofence
          </Text>
          <Text
            style={[
              homeModalStyles.modalText,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            You are outside the Obrero geofence. Starting a trip now may cause a violation.
          </Text>
          <View style={homeModalStyles.modalActions}>
            <Pressable style={homeModalStyles.modalPrimaryButton} onPress={onAcknowledge}>
              <Text style={homeModalStyles.modalPrimaryText}>I Understand</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
