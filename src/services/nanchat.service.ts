import crypto from 'node:crypto';
import { wallet, tools, box } from 'multi-nano-web';
import { fn, col } from 'sequelize';
import { CrashBet, User } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration (read from env)
// ---------------------------------------------------------------------------

const NANCHAT_API_URL = process.env.NANCHAT_API_URL || 'https://api.nanchat.com';
const NANCHAT_GROUP_ID = process.env.NANCHAT_GROUP_ID || '';
const NANCHAT_PRIVATE_KEY = process.env.NANCHAT_PRIVATE_KEY || '';

// ---------------------------------------------------------------------------
// Prize table
// ---------------------------------------------------------------------------

export type WheelPrize =
  | { currency: 'XNO'; amount: 0.1 | 0.5 | 1 | 5 }
  | { currency: 'NANUSD'; amount: 0.1 | 0.5 | 1 | 5 }
  | { currency: 'BAN'; amount: 100 | 500 | 1000 | 10000 }
  | { currency: 'NONE'; amount: 0 };

const PRIZE_TABLE: WheelPrize[] = [
  { currency: 'NONE', amount: 0 },      // 0   score  0–18  → rien
  { currency: 'XNO', amount: 0.1 },     // 1   score 19–29
  { currency: 'XNO', amount: 0.5 },     // 2   score 30–39
  { currency: 'BAN', amount: 100 },     // 3   score 40–49
  { currency: 'NANUSD', amount: 0.1 },  // 4   score 50–59
  { currency: 'BAN', amount: 500 },     // 5   score 60–67
  { currency: 'NANUSD', amount: 0.5 },  // 6   score 68–74
  { currency: 'XNO', amount: 1 },       // 7   score 75–80
  { currency: 'NANUSD', amount: 1 },    // 8   score 81–85
  { currency: 'BAN', amount: 1000 },    // 9   score 86–89
  { currency: 'XNO', amount: 5 },       // 10  score 90–93
  { currency: 'NANUSD', amount: 5 },    // 11  score 94–96
  { currency: 'BAN', amount: 10000 },   // 12  score 97–98
  { currency: 'NANUSD', amount: 5 },    // 13  score 99–100 (jackpot rare)
];

// Maps a score 0–100 to a prize table index
function scoreToPrizeIndex(score: number): number {
  if (score < 19) return 0;
  if (score < 30) return 1;
  if (score < 40) return 2;
  if (score < 50) return 3;
  if (score < 60) return 4;
  if (score < 68) return 5;
  if (score < 75) return 6;
  if (score < 81) return 7;
  if (score < 86) return 8;
  if (score < 90) return 9;
  if (score < 94) return 10;
  if (score < 97) return 11;
  if (score < 99) return 12;
  return 13;
}

// ---------------------------------------------------------------------------
// NanChat authentication
// ---------------------------------------------------------------------------

/**
 * Signs in to NanChat using the platform wallet seed and returns a session token.
 */
async function authenticateNanChat(): Promise<string> {
  if (!NANCHAT_PRIVATE_KEY) {
    throw new Error('NANCHAT_PRIVATE_KEY is not set');
  }
  if (!NANCHAT_GROUP_ID) {
    throw new Error('NANCHAT_GROUP_ID is not set');
  }

  const accountData = wallet.fromLegacySeed(NANCHAT_PRIVATE_KEY).accounts[0];
  const account = accountData.address;
  const derivedPrivateKey = accountData.privateKey;

  const date = new Date().toISOString();
  const loginMessage = `Login to nanwallet.com chat. Date:${date}`;
  const signature = tools.sign(derivedPrivateKey, `Signed Message: ${loginMessage}`);

  const response = await fetch(`${NANCHAT_API_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, message: loginMessage, signature }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NanChat auth failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

// ---------------------------------------------------------------------------
// Add member to group
// ---------------------------------------------------------------------------

/**
 * Authenticates with NanChat, adds a member to the configured group, then
 * generates a new shared wallet and distributes the encrypted shared key to
 * all current participants (including the newly added member).
 */
export async function addMemberToGroup(memberAddress: string): Promise<void> {
  const accountData = wallet.fromLegacySeed(NANCHAT_PRIVATE_KEY).accounts[0];
  const derivedPrivateKey = accountData.privateKey;

  const token = await authenticateNanChat();

  // 1. Add the participant — response contains the updated chat with all participants
  const addResponse = await fetch(`${NANCHAT_API_URL}/add-participants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token,
    },
    body: JSON.stringify({
      chatId: NANCHAT_GROUP_ID,
      participants: [memberAddress],
    }),
  });

  if (!addResponse.ok) {
    const body = await addResponse.text();
    throw new Error(`NanChat add-participants failed (${addResponse.status}): ${body}`);
  }

  const updatedChat = (await addResponse.json()) as {
    participants: (string | { account?: string; _id?: string })[]
  };

  logger.info('NanChat: member added to group', { memberAddress, groupId: NANCHAT_GROUP_ID });

  // 2. Generate a fresh shared wallet for this group session
  const sharedWallet = wallet.generate();
  const sharedAccount = sharedWallet.accounts[0];
  const sharedPk = sharedAccount.privateKey;
  const sharedAddress = sharedAccount.address;

  // 3. Extract all participant addresses from the updated chat
  const participants = updatedChat.participants
    .map((p) => (typeof p === 'string' ? p : (p.account ?? p._id ?? '')))
    .filter(Boolean);

  logger.info('NanChat: distributing shared key', {
    groupId: NANCHAT_GROUP_ID,
    participantCount: participants.length,
  });

  // 4. Encrypt the shared private key for each participant
  const sharedKeys = participants.map((participant) => ({
    sharedAccount: sharedAddress,
    encryptedKey: box.encrypt(sharedPk, participant, derivedPrivateKey),
    toAccount: participant,
  }));

  // 5. Push the new shared keys to NanChat
  const keysResponse = await fetch(`${NANCHAT_API_URL}/sharedKeys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token,
    },
    body: JSON.stringify({
      chatId: NANCHAT_GROUP_ID,
      sharedKeys,
    }),
  });

  if (!keysResponse.ok) {
    const body = await keysResponse.text();
    throw new Error(`NanChat sharedKeys failed (${keysResponse.status}): ${body}`);
  }

  logger.info('NanChat: shared keys distributed successfully', {
    groupId: NANCHAT_GROUP_ID,
    participantCount: participants.length,
  });
}

// ---------------------------------------------------------------------------
// Wheel computation
// ---------------------------------------------------------------------------

/**
 * Computes a deterministic wheel result for a user.
 *
 * Score breakdown (0–100):
 *  - ageScore    (0–40): days since account creation, capped at 365 days
 *  - volumeScore (0–40): total bet volume converted to USD, capped at $100
 *  - luckScore   (0–20): pseudo-random salt derived from the wallet address
 */
export async function computeWheelResult(user: User): Promise<WheelPrize> {
  // --- Age score ---
  const ageMs = Date.now() - new Date(user.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const ageScore = Math.min(40, Math.round((ageDays / 365) * 40));

  // --- Volume score (USD-equivalent) ---
  // Reference conversion rates to USD
  const USD_RATES: Record<string, number> = {
    NANUSD: 1,
    XNO:    0.44,
    BAN:    0.0004693,
    XRO:    0.0002054,
    ANA:    0.000001482,
    XDG:    0.00294,
  };

  // Fetch sum of bets grouped by currency for this user
  const volumeRows = (await CrashBet.findAll({
    where: { userId: user.id },
    attributes: ['currency', [fn('SUM', col('betAmount')), 'totalAmount']],
    group: ['currency'],
    raw: true,
  })) as unknown as { currency: string; totalAmount: string }[];

  // Convert each currency to USD and accumulate
  const totalVolumeUSD = volumeRows.reduce((acc, row) => {
    const rate = USD_RATES[row.currency] ?? 0;
    return acc + parseFloat(row.totalAmount) * rate;
  }, 0);

  // Cap at $100 → score 0–40
  const volumeScore = Math.min(40, Math.round((Math.min(totalVolumeUSD, 100) / 100) * 40));

  // --- Luck score (0–20, deterministic from address) ---
  const addressHash = crypto.createHash('sha256').update(user.address).digest('hex');
  const luckScore = Number.parseInt(addressHash.slice(0, 4), 16) % 21; // 0–20

  const totalScore = ageScore + volumeScore + luckScore;
  const prizeIndex = scoreToPrizeIndex(totalScore);
  const prize = PRIZE_TABLE[prizeIndex];

  logger.info('NanChat wheel computed', {
    userId: user.id,
    ageScore,
    volumeScore,
    luckScore,
    totalScore,
    prize,
  });

  return prize;
}

// ---------------------------------------------------------------------------
// Credit prize to user balance
// ---------------------------------------------------------------------------

/**
 * Increments the appropriate balance on the user record based on the wheel prize.
 */
export async function creditWheelPrize(user: User, prize: WheelPrize): Promise<void> {
  if (prize.currency === 'NONE') {
    return;
  }

  const fieldMap: Record<string, keyof User> = {
    XNO: 'balanceXNO',
    NANUSD: 'balanceNANUSD',
    BAN: 'balanceBAN',
  };

  const field = fieldMap[prize.currency];
  if (!field) return;

  const currentBalance = Number(user[field]) || 0;
  await user.update({ [field]: currentBalance + prize.amount });

  logger.info('NanChat wheel prize credited', {
    userId: user.id,
    currency: prize.currency,
    amount: prize.amount,
    newBalance: currentBalance + prize.amount,
  });
}
