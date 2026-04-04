import { Modal, Pressable, Text, View } from 'react-native';
import { homeModalStyles } from './homeModalStyles';
import { AppIcon } from '../../ui';

type TripActionModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function TripActionModal({
  visible,
  onRequestClose,
  onConfirm,
  onCancel,
  title = 'Go online and open trips?',
  description = 'You will start sharing your live location and open the trip workspace so you can begin work right away.',
  confirmLabel = 'Go Online',
  cancelLabel = 'Not Now',
}: TripActionModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={homeModalStyles.modalBackdrop}>
        <View style={homeModalStyles.modalCard}>
          <View style={homeModalStyles.modalIconWrap}>
            <AppIcon name="navigation" size={20} color="#57c7a8" />
          </View>
          <Text style={homeModalStyles.modalTitle}>{title}</Text>
          <Text style={homeModalStyles.modalText}>{description}</Text>
          <View style={homeModalStyles.modalActions}>
            <Pressable style={homeModalStyles.modalPrimaryButton} onPress={onConfirm}>
              <Text style={homeModalStyles.modalPrimaryText}>{confirmLabel}</Text>
            </Pressable>
            <Pressable style={homeModalStyles.modalGhostButton} onPress={onCancel}>
              <Text style={homeModalStyles.modalGhostText}>{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
