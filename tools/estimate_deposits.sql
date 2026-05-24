-- Requête d'estimation des dépôts pour BANANO (BAN)
-- Utilisateur : x

WITH user_stats AS (
    SELECT
        id as user_id,
        balanceBAN as current_balance
    FROM users
    WHERE id = 'x'
),
withdrawal_stats AS (
    SELECT
        userId,
        COALESCE(SUM(amount), 0) as total_withdrawals
    FROM withdrawals
    WHERE userId = 'x'
      AND currency = 'BAN'
      AND status IN ('completed', 'processing', 'pending')
    GROUP BY userId
),
bet_stats AS (
    SELECT
        userId,
        COALESCE(SUM(profit), 0) as net_bet_profit
    FROM crash_bets
    WHERE userId = 'x'
      AND currency = 'BAN'
      AND status IN ('cashed_out', 'lost')
    GROUP BY userId
)
SELECT
    u.current_balance,
    COALESCE(w.total_withdrawals, 0) as total_withdrawals,
    COALESCE(b.net_bet_profit, 0) as net_bet_profit,
    (u.current_balance + COALESCE(w.total_withdrawals, 0) - COALESCE(b.net_bet_profit, 0)) as estimated_total_deposits
FROM user_stats u
LEFT JOIN withdrawal_stats w ON u.user_id = w.userId
LEFT JOIN bet_stats b ON u.user_id = b.userId;
