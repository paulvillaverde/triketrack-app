import { PropsWithChildren } from 'react';
import { Pressable, PressableProps } from 'react-native';

type AnimatedButtonProps = PropsWithChildren<PressableProps>;

export function AnimatedButton({ children, ...props }: AnimatedButtonProps) {
  return <Pressable {...props}>{children}</Pressable>;
}

