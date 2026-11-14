import { describe, expect, it } from 'vitest';

import { csvCell, csvRow, formatCents } from './csv.ts';

describe('csvCell', () => {
  it('writes plain text and numbers as they are', () => {
    expect(csvCell('Rope toy')).toBe('Rope toy');
    expect(csvCell(1234)).toBe('1234');
    expect(csvCell(-500)).toBe('-500'); // a number we generated, not text a customer typed
    expect(csvCell(null)).toBe('');
  });

  it('quotes commas, quotes and line breaks, doubling the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'defuses a text that a spreadsheet would run as a formula: %j',
    (text) => {
      const out = csvCell(text);
      expect(out.startsWith("'") || out.startsWith('"\'')).toBe(true);
    },
  );

  it('defuses and quotes at once', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });

  it('leaves a formula character that is not at the start alone', () => {
    expect(csvCell('a=b')).toBe('a=b');
  });
});

describe('csvRow and formatCents', () => {
  it('ends rows with CRLF', () => {
    expect(csvRow(['a', 1, null])).toBe('a,1,\r\n');
  });
  it('formats integer cents without floats', () => {
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(123456)).toBe('1234.56');
    expect(formatCents(-250)).toBe('-2.50');
  });
});
