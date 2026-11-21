import type { weight as enNs } from '../en/weight';
import type { Entry } from '../types';

export const weight: Record<keyof typeof enNs, Entry> = {
  'weight.about': 'etwa {weight} · {perKg}/kg · ca. {price}',
  'weight.aboutShort': 'etwa {weight}',
  'weight.est': 'ca. {price}',
  'weight.notice':
    'Endpreis nach dem Wiegen. Wir reservieren bis zu {max} auf deiner Karte und buchen nur ab, was es wiegt.',
  'weight.held':
    '{amount} ist auf deiner Karte reserviert und wird abgebucht, sobald wir deine Bestellung packen.',
  'weight.heldWeighed':
    'Wir reservieren bis zu {amount} auf deiner Karte und buchen ab, was deine Tüte wiegt: der Endpreis steht nach dem Wiegen fest.',
  'weight.weighed': 'Gewogen: {weight}',
  'weight.finalBill': 'Schlussrechnung: {amount} von deiner Karte abgebucht.',
  'weight.finalBillReleased':
    'Schlussrechnung: {amount} von deiner Karte abgebucht. Reserviert waren {held}; der Rest wird freigegeben.',
};
