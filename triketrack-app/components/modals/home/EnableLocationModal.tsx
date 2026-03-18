import { Modal, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { homeModalStyles } from './homeModalStyles';

type EnableLocationModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onGrantPermission: () => void | Promise<void>;
  onMaybeLater: () => void;
};

export function EnableLocationModal({
  visible,
  onRequestClose,
  onGrantPermission,
  onMaybeLater,
}: EnableLocationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={homeModalStyles.modalBackdrop}>
        <View style={homeModalStyles.modalCard}>
          <View style={homeModalStyles.modalIconWrap}>
            <Feather name="map-pin" size={20} color="#57c7a8" />
          </View>
          <Text style={homeModalStyles.modalTitle}>Enable Location</Text>
          <Text style={homeModalStyles.modalText}>
            To be able to use the service, we require permission to access your location.
          </Text>
          <View style={homeModalStyles.modalActions}>
            <Pressable style={homeModalStyles.modalPrimaryButton} onPress={onGrantPermission}>
              <Text style={homeModalStyles.modalPrimaryText}>Grant Permission</Text>
            </Pressable>
            <Pressable style={homeModalStyles.modalGhostButton} onPress={onMaybeLater}>
              <Text style={homeModalStyles.modalGhostText}>Maybe Later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
