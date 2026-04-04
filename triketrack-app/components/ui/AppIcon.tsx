import { Ionicons } from '@expo/vector-icons';

const ICON_MAP = {
  activity: { outline: 'analytics-outline', filled: 'analytics' },
  'alert-circle': { outline: 'alert-circle-outline', filled: 'alert-circle' },
  'alert-octagon': { outline: 'alert-circle-outline', filled: 'alert-circle' },
  'alert-triangle': { outline: 'warning-outline', filled: 'warning' },
  bell: { outline: 'notifications-outline', filled: 'notifications' },
  calendar: { outline: 'calendar-outline', filled: 'calendar' },
  check: { outline: 'checkmark', filled: 'checkmark' },
  'check-circle': { outline: 'checkmark-circle-outline', filled: 'checkmark-circle' },
  'chevron-left': { outline: 'chevron-back', filled: 'chevron-back' },
  'chevron-right': { outline: 'chevron-forward', filled: 'chevron-forward' },
  clock: { outline: 'time-outline', filled: 'time' },
  'cloud-off': { outline: 'cloud-offline-outline', filled: 'cloud-offline' },
  'credit-card': { outline: 'card-outline', filled: 'card' },
  crosshair: { outline: 'locate-outline', filled: 'locate' },
  'dollar-sign': { outline: 'cash-outline', filled: 'cash' },
  'edit-2': { outline: 'create-outline', filled: 'create' },
  'edit-3': { outline: 'pencil-outline', filled: 'pencil' },
  eye: { outline: 'eye-outline', filled: 'eye' },
  'eye-off': { outline: 'eye-off-outline', filled: 'eye-off' },
  'file-text': { outline: 'document-text-outline', filled: 'document-text' },
  folder: { outline: 'folder-outline', filled: 'folder' },
  globe: { outline: 'globe-outline', filled: 'globe' },
  home: { outline: 'home-outline', filled: 'home' },
  lock: { outline: 'lock-closed-outline', filled: 'lock-closed' },
  'log-out': { outline: 'log-out-outline', filled: 'log-out' },
  mail: { outline: 'mail-outline', filled: 'mail' },
  map: { outline: 'map-outline', filled: 'map' },
  'map-pin': { outline: 'location-outline', filled: 'location' },
  minus: { outline: 'remove', filled: 'remove' },
  moon: { outline: 'moon-outline', filled: 'moon' },
  navigation: { outline: 'navigate-outline', filled: 'navigate' },
  phone: { outline: 'call-outline', filled: 'call' },
  plus: { outline: 'add', filled: 'add' },
  radio: { outline: 'radio-button-off-outline', filled: 'radio-button-on' },
  'refresh-cw': { outline: 'refresh-outline', filled: 'refresh' },
  search: { outline: 'search-outline', filled: 'search' },
  tag: { outline: 'pricetag-outline', filled: 'pricetag' },
  user: { outline: 'person-outline', filled: 'person' },
  x: { outline: 'close-outline', filled: 'close' },
} as const;

export type AppIconName = keyof typeof ICON_MAP;

type AppIconProps = Omit<React.ComponentProps<typeof Ionicons>, 'name'> & {
  name: AppIconName;
  active?: boolean;
};

export function AppIcon({ name, active = false, ...props }: AppIconProps) {
  return <Ionicons name={ICON_MAP[name][active ? 'filled' : 'outline']} {...props} />;
}
