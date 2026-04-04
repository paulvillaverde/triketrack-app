import type { ComponentProps } from 'react';
import { HomeScreen } from './HomeScreen';

type StartTripScreenProps = Omit<ComponentProps<typeof HomeScreen>, 'isTripScreen'>;

export function StartTripScreen(props: StartTripScreenProps) {
  return <HomeScreen {...props} isTripScreen tripNavigationMode={false} />;
}
