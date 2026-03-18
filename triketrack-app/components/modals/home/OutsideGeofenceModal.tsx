import { Modal, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { homeModalStyles } from './homeModalStyles';

type OutsideGeofenceModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onAcknowledge: () => void;
};

export function OutsideGeofenceModal({
  visible,
  onRequestClose,
  onAcknowledge,
}: OutsideGeofenceModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={homeModalStyles.modalBackdrop}>
        <View style={homeModalStyles.modalCard}>
          <View style={[homeModalStyles.modalIconWrap, homeModalStyles.modalIconWarnWrap]}>
            <Feather name="alert-triangle" size={20} color="#B45309" />
          </View>
          <Text style={homeModalStyles.modalTitle}>Outside Geofence</Text>
          <Text style={homeModalStyles.modalText}>
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

