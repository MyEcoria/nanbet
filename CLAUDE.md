# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun run dev` / `bun run start` — run the server (`src/app.ts`), no build step (Bun runs TS directly)
- `bun run type-check` — TypeScript validation (`tsc --noEmit`)
- `bun run lint` — Biome lint/format check (`biome check .`)
- `bun run lint:fix` — Biome autofix
- `bun run lint:fix-unsafe` — Biome autofix including unsafe fixes
- `bun run format` — Biome format only
- `bun run db:migrate` / `db:migrate:undo` / `db:migrate:status` — Sequelize CLI migrations
- `bun run db:migration:generate --name <name>` — scaffold a new migration in `migrations/`
- There is no test suite (`npm test` is a stub that exits 1)

Package manager is Bun; `bun install` to set up dependencies. Requires a MySQL/MariaDB database and a `.env` (see `.env.example`) with DB credentials, Nanswap Nodes API key, and admin key.

## Architecture

This is a crypto casino backend (Nano and Nano forks: XNO, XRO, BAN, and others defined in `src/config/wallets.ts`) built on Express + Socket.IO + Sequelize, entry point `src/app.ts`.

### Startup sequence (`src/app.ts`)
Order matters here — later steps depend on the Socket.IO server and services created earlier:
1. Sequelize syncs models (`sequelize.sync`)
2. `CrashSocketHandler` starts (owns the Socket.IO server instance — other sockets/services attach to `crashSocketHandler.getIO()`)
3. `maintenanceService` initializes and gets a reference to the crash service (maintenance mode can pause the crash game)
4. `websocketService` initializes per-currency `ReconnectingWebSocket` connections (one per entry in `wallets.ts`) to Nanswap's node WS feeds, and subscribes to user deposit addresses
5. `hot-wallet-sweeper.service` starts (periodically sweeps deposited funds)
6. `sports.service` gets the shared IO instance, `sports-odds.service` (Polymarket odds) and `polymarket-sync.service` start
7. Recurring intervals: sports rate-limit cleanup (60s), full WebSocket reconnect (hourly)

### Deposits / withdrawals flow
`websocket.service.ts` holds one `ReconnectingWebSocket` per currency, listens for incoming Nanswap node confirmation messages, and processes deposits by matching the account address back to a user. Withdrawals go through `withdrawal.service.ts` + `utils/nanswap_wallet.ts` (uses `sendFeeless` to broadcast). `utils/unit_converts.ts` (`Converter`) and `utils/currency.ts` handle raw/display amount conversion and validation per-currency; always use these rather than manual decimal math, since each currency in `wallets.ts` has its own `decimalsToShow`/prefix/maxBet.

### Crash game
`sockets/crash.socket.ts` + `services/crash.service.ts` (`CrashGameService`) implement the provably-fair crash game: game loop (betting phase → tick loop → crash), bet placement, cashout, rate limiting for bet/cashout attempts (in-memory Maps), and game history. Provable fairness (seed generation, crash point/multiplier calculation) lives in `utils/provably-fair.ts`. This service owns the single shared Socket.IO server that other real-time features (sports, deposits) piggyback on.

### Sports betting
`sockets/sports.socket.ts` + `services/sports.service.ts` handle match listing, live odds, and bet placement/settlement over Socket.IO (`sports:matches`, `sports:odds`, `sports:bet:place`, `sports:bet:settled`). `services/sports-odds.service.ts` (Polymarket) computes/streams odds; `services/polymarket-sync.service.ts` syncs match data from Polymarket on an interval. `models/SportsMatch.model.ts` / `SportsBet.model.ts` back this.

### Maintenance mode
`services/maintenance.service.ts` + `models/Maintenance.model.ts` + `middlewares/maintenance.middleware.ts` gate routes/games during maintenance; the crash service is paused/resumed via the reference passed in during startup.

### Auth & admin
`middlewares/auth.middleware.ts` validates user sessions/JWTs for `/user` and `/withdrawal` routes; `middlewares/admin.middleware.ts` requires the `X-Admin-Key` header (value from `.env`) for `/admin` routes. `middlewares/turnstile.middleware.ts` validates Cloudflare Turnstile captcha tokens.

### Routes → Controllers → Services
Each route file in `src/routes/` (`user`, `withdrawal`, `admin`, `sports`) maps to a controller in `src/controllers/`, which delegates business logic to the matching service in `src/services/`. Models (Sequelize) live in `src/models/`; shared types in `src/types/`.
