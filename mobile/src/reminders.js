// Optional daily nudge: one local notification a day, scheduled on the phone (no server, no
// push token). The text follows the person's real next step and is refreshed whenever the app
// loads fresh data. Every call is guarded: if notifications are unavailable or refused, the
// reminder is simply off.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { reminderText } from './model.js';

export { reminderText };

const KEY = 'praxio-reminder-v1';
const CHANNEL = 'daily-nudge';
export const REMINDER_TIMES = [
  { id: 'morning', label: 'Morning', hour: 8, minute: 0 },
  { id: 'evening', label: 'Evening', hour: 19, minute: 0 },
  { id: 'night', label: 'Night', hour: 21, minute: 30 },
];
export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';

if (remindersSupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch {
    // notifications module unavailable: reminders stay off
  }
}

export async function readReminder() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
    return v && typeof v === 'object' ? v : { enabled: false, time: 'evening' };
  } catch {
    return { enabled: false, time: 'evening' };
  }
}

const save = (v) => AsyncStorage.setItem(KEY, JSON.stringify(v)).catch(() => {});

async function ensurePermission() {
  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Daily nudge', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL) return true;
  if (current.canAskAgain === false) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return Boolean(asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL);
}

async function schedule(state, body) {
  if (state.id) await Notifications.cancelScheduledNotificationAsync(state.id).catch(() => {});
  const time = REMINDER_TIMES.find((x) => x.id === state.time) ?? REMINDER_TIMES[1];
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: 'Praxio', body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute, channelId: CHANNEL },
  });
  return { ...state, id, body };
}

/** Turn the nudge on (asks permission). Returns { ok, reason?, state }. */
export async function enableReminder(time, body) {
  if (!remindersSupported) return { ok: false, reason: 'Reminders work in the phone app.' };
  try {
    if (!(await ensurePermission())) {
      return { ok: false, reason: 'Notifications are off for Praxio. Turn them on in your phone’s Settings to get a daily nudge.' };
    }
    const next = await schedule({ ...(await readReminder()), enabled: true, time }, body);
    await save(next);
    return { ok: true, state: next };
  } catch {
    return { ok: false, reason: 'Couldn’t set the reminder on this phone.' };
  }
}

export async function disableReminder() {
  const state = await readReminder();
  try {
    if (state.id) await Notifications.cancelScheduledNotificationAsync(state.id);
  } catch {
    // already gone
  }
  const next = { ...state, enabled: false, id: null };
  await save(next);
  return next;
}

/** Keep the nudge text in step with the real next step (only reschedules if it changed). */
export async function refreshReminder(body) {
  if (!remindersSupported || !body) return;
  try {
    const state = await readReminder();
    if (!state.enabled || state.body === body) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await save(await schedule(state, body));
  } catch {
    // keep the existing reminder
  }
}
