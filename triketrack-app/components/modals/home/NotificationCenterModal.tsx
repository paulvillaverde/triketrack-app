import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '../../ui';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_BORDER_SOFT_DARK,
  MAXIM_UI_GREEN_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../../screens/homeScreenShared';

export type NotificationCenterItem = {
  id: string;
  category: 'account' | 'profile' | 'trip' | 'violation' | 'appeal';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  icon: AppIconName;
  target?: NotificationCenterTarget;
  dedupeKey?: string;
};

export type NotificationCenterTarget = {
  screen: 'home' | 'profile' | 'trip' | 'startTrip' | 'tripNavigation' | 'violation';
  itemId?: string | null;
};

type NotificationCenterModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  notifications: NotificationCenterItem[];
  unreadCount: number;
  onPressNotification: (notification: NotificationCenterItem) => void;
  onMarkAllRead: () => void;
  isLowBatteryMapMode?: boolean;
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
  isLowBatteryMapMode = false,
}: NotificationCenterModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onRequestClose}
    >
      <View
        style={[
          styles.screen,
          {
            paddingTop: 12 + insets.top,
            paddingBottom: 18 + insets.bottom,
          },
          isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_SURFACE_DARK } : null,
        ]}
      >
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <Pressable
                style={[
                  styles.backButton,
                  isLowBatteryMapMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
                onPress={onRequestClose}
              >
                <AppIcon
                  name="chevron-left"
                  size={20}
                  color={isLowBatteryMapMode ? MAXIM_UI_TEXT_DARK : '#0F172A'}
                />
              </Pressable>
            </View>
            <Text
              style={[
                styles.title,
                isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
              ]}
              numberOfLines={1}
            >
              Notifications
            </Text>
            <View style={styles.headerSide} />
          </View>

          <View style={styles.summaryRow}>
            <Text
              style={[
                styles.subtitle,
                isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
              ]}
            >
              {unreadCount > 0
                ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}`
                : 'Everything is up to date'}
            </Text>
            {unreadCount > 0 ? (
              <Pressable
                style={[
                  styles.markAllButton,
                  isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_GREEN_SOFT_DARK } : null,
                ]}
                onPress={onMarkAllRead}
              >
                <Text style={styles.markAllButtonText}>Mark all read</Text>
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={notifications.length === 0 ? styles.emptyListContent : styles.listContent}
            ItemSeparatorComponent={() => (
              <View
                style={[
                  styles.separator,
                  isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
                ]}
              />
            )}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.row,
                  !item.read && styles.rowUnread,
                  isLowBatteryMapMode && !item.read
                    ? { backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK }
                    : null,
                ]}
                onPress={() => onPressNotification(item)}
              >
                <View
                  style={[
                    styles.iconWrap,
                    isLowBatteryMapMode
                      ? {
                          backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                          borderColor: MAXIM_UI_BORDER_DARK,
                        }
                      : null,
                    !item.read && styles.iconWrapUnread,
                  ]}
                >
                  <AppIcon name={item.icon} size={18} color={!item.read ? '#147D64' : '#475569'} />
                </View>
                <View style={styles.textWrap}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[
                        styles.rowTitle,
                        isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                        !item.read && styles.rowTitleUnread,
                        !item.read && isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        styles.rowTime,
                        isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                      ]}
                    >
                      {formatNotificationTime(item.createdAt)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.rowMessage,
                      isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK, opacity: 0.86 } : null,
                    ]}
                    numberOfLines={2}
                  >
                    {item.message}
                  </Text>
                </View>
                {!item.read ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View
                  style={[
                    styles.emptyIconWrap,
                    isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_GREEN_SOFT_DARK } : null,
                  ]}
                >
                  <AppIcon name="bell" size={24} color="#57C7A8" />
                </View>
                <Text
                  style={[
                    styles.emptyTitle,
                    isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  No notifications yet
                </Text>
                <Text
                  style={[
                    styles.emptySubtitle,
                    isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                >
                  Profile updates, trip activity, and violation changes will appear here.
                </Text>
              </View>
            }
          />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerSide: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 24,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  summaryRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  subtitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
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
  backButton: {
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
