// Gentle haptic feedback. Never throws: on the web, or on devices without haptics, it is a no-op.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function haptic(kind = 'tap') {
  if (Platform.OS === 'web') return;
  try {
    const p = kind === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : kind === 'error'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        : Haptics.selectionAsync();
    p?.catch?.(() => {});
  } catch {
    // haptics unavailable: ignore
  }
}
