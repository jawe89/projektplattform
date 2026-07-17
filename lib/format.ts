/**
 * Schweizer Formatierungs-Helfer.
 * Datumsformat TT.MM.JJJJ, Tausendertrennzeichen mit Apostroph (1'250'000),
 * CHF-Beträge zweistellig (CHF 1'250'000.00).
 */

/** 2026-06-01 → «01.06.2026» */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/** 1250000 → «1'250'000» */
export function formatNumber(value: number, fractionDigits = 0): string {
  const fixed = value.toFixed(fractionDigits);
  const [integer, fraction] = fixed.split('.');
  const sign = integer.startsWith('-') ? '-' : '';
  const digits = sign ? integer.slice(1) : integer;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return sign + grouped + (fraction ? `.${fraction}` : '');
}

/** 1250000 → «CHF 1'250'000.00» */
export function formatChf(value: number): string {
  return `CHF ${formatNumber(value, 2)}`;
}
