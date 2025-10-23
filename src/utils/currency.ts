import wallets from '../config/wallets';

export function validateAndNormalizeAmount(amount: number, currency: string): {
  valid: boolean;
  normalizedAmount?: number;
  error?: string;
} {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: 'Invalid amount format' };
  }

  if (amount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  const wallet = wallets[currency as keyof typeof wallets];
  if (!wallet) {
    return { valid: false, error: 'Invalid currency' };
  }

  const decimals = wallet.decimalsToShow;
  const multiplier = 10 ** decimals;
  const normalizedAmount = Math.floor(amount * multiplier) / multiplier;

  if (normalizedAmount <= 0) {
    return { valid: false, error: 'Amount too small for currency precision' };
  }

  return {
    valid: true,
    normalizedAmount,
  };
}

export function getCurrencyDecimals(currency: string): number {
  const wallet = wallets[currency as keyof typeof wallets];
  return wallet?.decimalsToShow ?? 2;
}
