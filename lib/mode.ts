// Which experience the app opens in: Field (quick dope at the range) or the
// full Development app. Remembered per device; null until the user picks.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppMode = 'field' | 'full';
const MODE_KEY = 'lrs.mode';

export async function getMode(): Promise<AppMode | null> {
  try {
    const v = await AsyncStorage.getItem(MODE_KEY);
    return v === 'field' || v === 'full' ? v : null;
  } catch { return null; }
}
export const setMode = (m: AppMode) => AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
