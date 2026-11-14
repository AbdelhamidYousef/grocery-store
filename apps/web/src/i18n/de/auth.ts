import type { auth as enNs } from '../en/auth';
import type { Entry } from '../types';

export const auth: Record<keyof typeof enNs, Entry> = {
  'auth.email': 'E-Mail',
  'auth.password': 'Passwort',
  'auth.firstName': 'Vorname',
  'auth.lastName': 'Nachname',
  'auth.signIn': 'Anmelden',
  'auth.createAccount': 'Konto erstellen',
  'auth.login.newHere': 'Neu hier?',
  'auth.login.createLink': 'Konto erstellen',
  'auth.register.passwordHint':
    'Mindestens {min} Zeichen. Ein paar zufällige Wörter ergeben ein starkes Passwort.',
  'auth.register.haveAccount': 'Hast du schon ein Konto?',
  'auth.expired.message':
    'Deine Sitzung ist abgelaufen, du wurdest deshalb abgemeldet. Dein Warenkorb ist noch da.',
  'auth.expired.signInLink': 'Erneut anmelden',
  'auth.expired.rest': 'um deine gespeicherten Daten zu nutzen, oder mach einfach als Gast weiter.',
  'auth.forbidden.seoTitle': 'Nicht erlaubt',
  'auth.forbidden.title': 'Du hast keinen Zugriff auf diese Seite',
  'auth.forbidden.body': 'Dieser Bereich ist nur für Shop-Administratoren.',
  'auth.error.network': 'Der Server ist nicht erreichbar. Prüfe deine Verbindung.',
  'auth.error.rateLimited': 'Zu viele Versuche. Bitte warte einige Minuten.',
  'auth.error.generic': 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
  'msg.auth.emailInvalid': 'Gib eine gültige E-Mail-Adresse ein',
  'msg.auth.required': 'Pflichtfeld',
  'msg.auth.passwordMin': 'Verwende mindestens 10 Zeichen',
  'msg.auth.passwordMax': 'Verwende höchstens 128 Zeichen',
  'msg.auth.passwordCommon': 'Dieses Passwort ist zu häufig',
  'msg.auth.emailTaken': 'Ein Konto mit dieser E-Mail-Adresse existiert bereits',
  'msg.auth.invalidCredentials': 'Ungültige E-Mail-Adresse oder ungültiges Passwort',
};
