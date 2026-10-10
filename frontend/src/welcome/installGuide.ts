export type InstallKind = 'installed' | 'ios-safari' | 'ios-other' | 'ipad-safari' |
  'android-chrome' | 'android-other' | 'desktop-chrome' | 'desktop-edge' |
  'desktop-safari' | 'other';

export function detectInstallKind(userAgent: string, standalone: boolean, touchPoints = 0): InstallKind {
  if (standalone) return 'installed';
  const ipad = /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
  const ios = ipad || /iPhone|iPod/i.test(userAgent);
  const safari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium|Edg\//i.test(userAgent);
  if (ios) return safari ? (ipad ? 'ipad-safari' : 'ios-safari') : 'ios-other';
  if (/Android/i.test(userAgent)) return /Chrome\//i.test(userAgent) && !/EdgA|SamsungBrowser|Firefox/i.test(userAgent)
    ? 'android-chrome' : 'android-other';
  if (/Edg\//i.test(userAgent)) return 'desktop-edge';
  if (/Chrome\/|Chromium\//i.test(userAgent)) return 'desktop-chrome';
  if (safari) return 'desktop-safari';
  return 'other';
}
