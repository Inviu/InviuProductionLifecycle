// Thin JSON wrapper over AsyncStorage. Every call is guarded so a storage
// failure (private mode, quota, etc.) never crashes a screen — reads fall back
// to a default and writes fail silently.
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function getJSON(key, fallback = null) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function setJSON(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function removeKey(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
