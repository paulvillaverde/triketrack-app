import { ReactNode } from 'react';
import { TextInput, TextInputProps, View } from 'react-native';

type InputFieldProps = {
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  styles: Record<string, any>;
} & Pick<
  TextInputProps,
  | 'placeholder'
  | 'placeholderTextColor'
  | 'secureTextEntry'
  | 'value'
  | 'onChangeText'
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'textContentType'
>;

export function InputField({ icon, trailingIcon, styles, ...textInputProps }: InputFieldProps) {
  return (
    <View style={styles.inputWrapper}>
      {icon ? <View style={styles.inputIcon}>{icon}</View> : null}
      <TextInput
        style={styles.input}
        placeholderTextColor={textInputProps.placeholderTextColor ?? '#9CA3AF'}
        {...textInputProps}
      />
      {trailingIcon ? <View style={styles.trailingIcon}>{trailingIcon}</View> : null}
    </View>
  );
}
