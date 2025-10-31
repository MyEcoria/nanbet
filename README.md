# Nanbet Backend
Casino platform backend with Nano & forks cryptocurrency payments.

## Setup
1. **Install dependencies**
```bash
bun install
```

2. **Configure environment**

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Fill in the required values:
- Database credentials (MariaDB/MySQL)
- Nanswap Nodes API keys (get them from https://nanswap.com/nodes)
- Admin key for admin routes

3. **Setup database**

Create a MySQL/MariaDB database:
```sql
CREATE DATABASE nanbet;
```

4. **Start the server**
```bash
bun run dev
```

Server runs on `http://localhost:3000` (or custom PORT from .env)

## API Routes

### User (`/user`)
- `POST /user/login` - Login
- `GET /user/balance` - Get balance
- `GET /user/deposit-address` - Get deposit address
- `GET /user/transactions` - Transaction history

### Withdrawal (`/withdrawal`)
- `POST /withdrawal/create` - Create withdrawal
- `GET /withdrawal/status/:id` - Withdrawal status
- `GET /withdrawal/history` - Withdrawal history

### Admin (`/admin`)
- `POST /admin/maintenance` - Toggle maintenance mode
- `GET /admin/withdrawals/failed` - Failed withdrawals

**Note**: Admin routes require `X-Admin-Key` header with value from `.env`

## Scripts

- `bun run dev` - Development mode
- `bun run start` - Production mode
- `bun run type-check` - TypeScript validation
- `bun run lint` - Code linting
