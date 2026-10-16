// Turns "98765 43210", "09876543210" or "+91 98765 43210" into "+919876543210".
module.exports.normalizeMobile = function normalizeMobile(input) {
  if (!input) return null;
  const cc = process.env.DEFAULT_COUNTRY_CODE || '91';
  let digits = String(input).replace(/[^\d]/g, '');
  if (String(input).trim().startsWith('+')) {
    // already international
  } else if (digits.length === 10) digits = cc + digits;
  else if (digits.length === 11 && digits.startsWith('0')) digits = cc + digits.slice(1);
  if (digits.length < 11 || digits.length > 15) return null;
  return `+${digits}`;
};
