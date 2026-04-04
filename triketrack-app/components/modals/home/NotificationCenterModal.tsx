import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '../../ui';

export type NotificationCenterItem = {
  id: string;
  category: 'account' | 'profile' | 'trip' | 'violation';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  icon: AppIconName;
};

type NotificationCenterModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  notifications: NotificationCenterItem[];
  unreadCount: number;
  onPressNotification: (notificationId: string) => void;
  onMarkAllRead: () => void;
};

const formatNotificationTime = (createdAt: string) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 6) {
    return `${diffDays}d`;
  }

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
};

export function NotificationCenterModal({
  visible,
  onRequestClose,
  notifications,
  unreadCount,
  onPressNotification,
  onMarkAllRead,
}: NotificationCenterModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.subtitle}>
                {unreadCount > 0
                  ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}`
                  : 'Everything is up to date'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              {unreadCount > 0 ? (
                <Pressable style={styles.markAllButton} onPress={onMarkAllRead}>
                  <Text style={styles.markAllButtonText}>Mark all read</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.closeButton} onPress={onRequestClose}>
                <AppIcon name="x" size={18} color="#0F172A" />
              </Pressable>
            </View>
          </View>

          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={notifications.length === 0 ? styles.emptyListContent : styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, !item.read && styles.rowUnread]}
                onPress={() => onPressNotification(item.id)}
              >
                <View style={[styles.iconWrap, !item.read && styles.iconWrapUnread]}>
                  <AppIcon name={item.icon} size={18} color={!item.read ? '#147D64' : '#475569'} />
                </View>
                <View style={styles.textWrap}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowTitle, !item.read && styles.rowTitleUnread]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowTime}>{formatNotificationTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.rowMessage} numberOfLines={2}>
                    {item.message}
                  </Text>
                </View>
                {!item.read ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <AppIcon name="bell" size={24} color="#57C7A8" />
                </View>
                <Text style={styles.emptyTitle}>No notifications yet</Text>
                <Text style={styles.emptySubtitle}>
                  Profile updates, trip activity, and violation changes will appear here.
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '82%',
    minHeight: '54%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    lineHeight: 26,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  markAllButton: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAllButtonText: {
    color: '#147D64',
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'CircularStdMedium500',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listContent: {
    paddingBottom: 10,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: '#EEF2F7',
    marginLeft: 64,
  },
  row: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rowUnread: {
    backgroundColor: '#FCFEFD',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnread: {
    backgroundColor: '#E8FBF6',
    borderColor: '#C7F0E3',
  },
  textWrap: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
    color: '#334155',
    fontFamily: 'CircularStdMedium500',
  },
  rowTitleUnread: {
    color: '#0F172A',
  },
  rowTime: {
    fontSize: 12,
    lineHeight: 15,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  rowMessage: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#57C7A8',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
});
