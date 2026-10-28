/**
 * Desktop notifications from the page, when the browser has them and the user
 * allows them. Every call is safe where Notification does not exist.
 */

const GRANTED: NotificationPermission = 'granted';
const DENIED: NotificationPermission = 'denied';

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Ask once, from a user gesture. Resolves whether notifications will show. */
export async function requestBrowserNotifications(): Promise<boolean> {
  if (!supported()) return false;
  if (Notification.permission === GRANTED) return true;
  if (Notification.permission === DENIED) return false;
  try {
    return (await Notification.requestPermission()) === GRANTED;
  } catch {
    return false;
  }
}

export function showBrowserNotification(title: string, body: string): void {
  if (!supported() || Notification.permission !== GRANTED) return;
  try {
    new Notification(title, { body });
  } catch {
    // Some browsers only allow notifications from a service worker; the toast still shows.
  }
}
