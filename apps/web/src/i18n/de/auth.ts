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
  'auth.register.haveAccount': 'Sie haben bereits ein Konto?',
  'auth.expired.message':
    'Ihre Sitzung ist abgelaufen, deshalb wurden Sie abgemeldet. Ihr Warenkorb ist noch da.',
  'auth.expired.signInLink': 'Erneut anmelden',
  'auth.expired.rest':
    'um Ihre gespeicherten Daten zu nutzen, oder machen Sie einfach als Gast weiter.',
  'auth.forbidden.seoTitle': 'Nicht erlaubt',
  'auth.forbidden.title': 'Sie haben keinen Zugriff auf diese Seite',
  'auth.forbidden.body': 'Dieser Bereich ist nur für Shop-Administratoren.',
  'auth.error.network': 'Der Server ist nicht erreichbar. Prüfen Sie Ihre Verbindung.',
  'auth.error.rateLimited': 'Zu viele Versuche. Bitte warten Sie einige Minuten.',
  'auth.error.generic': 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
  'msg.auth.emailInvalid': 'Geben Sie eine gültige E-Mail-Adresse ein',
  'msg.auth.required': 'Pflichtfeld',
  'msg.auth.passwordMin': 'Verwenden Sie mindestens 10 Zeichen',
  'msg.auth.passwordMax': 'Verwenden Sie höchstens 128 Zeichen',
  'msg.auth.passwordCommon': 'Dieses Passwort ist zu häufig',
  'msg.auth.emailTaken': 'Ein Konto mit dieser E-Mail-Adresse existiert bereits',
  'msg.auth.invalidCredentials': 'Ungültige E-Mail-Adresse oder ungültiges Passwort',
};
