import { Modal, Pressable, Text, View } from 'react-native';
import { profileModalStyles } from './profileModalStyles';

type SupportModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onClose: () => void;
};

export function SupportModal({ visible, onRequestClose, onClose }: SupportModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={profileModalStyles.modalOverlay}>
        <View style={profileModalStyles.infoModalCard}>
          <Text style={profileModalStyles.modalTitle}>Support</Text>
          <Text style={profileModalStyles.infoText}>
            For technical issues, contact the operations desk or support team.
          </Text>
          <Text style={profileModalStyles.infoText}>Hotline: 0917-123-4567</Text>
          <Text style={profileModalStyles.infoText}>Email: support@triketrack.app</Text>
          <Pressable style={profileModalStyles.modalPrimaryButton} onPress={onClose}>
            <Text style={profileModalStyles.modalPrimaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

