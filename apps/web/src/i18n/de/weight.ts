import type { weight as enNs } from '../en/weight';
import type { Entry } from '../types';

export const weight: Record<keyof typeof enNs, Entry> = {
  'weight.about': 'etwa {weight} · {perKg}/kg · ca. {price}',
  'weight.aboutShort': 'etwa {weight}',
  'weight.est': 'ca. {price}',
  'weight.notice':
    'Endpreis nach dem Wiegen. Wir reservieren bis zu {max} auf deiner Karte und buchen nur ab, was es wiegt.',
};
