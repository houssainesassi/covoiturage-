/**
 * Tunisian phone numbers: 8 national digits, country code +216.
 * Mobile prefixes 2x (Ooredoo), 4x (Lycamobile), 5x (Orange), 9x (Tunisie Telecom);
 * fixed lines 3x / 7x.
 */
export const TN_PHONE_REGEX = /^\+216[2-9]\d{7}$/;

export function normalizeTunisianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("00216")) digits = "+216" + digits.slice(5);
  else if (digits.startsWith("216") && digits.length === 11) digits = "+" + digits;
  else if (/^\d{8}$/.test(digits)) digits = "+216" + digits;
  return TN_PHONE_REGEX.test(digits) ? digits : null;
}

/** +21622123456 → +216 22 123 456 */
export function formatTunisianPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+216(\d{2})(\d{3})(\d{3})$/);
  return m ? `+216 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
