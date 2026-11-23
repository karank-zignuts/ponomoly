# Ponomoly handoff

Snapshot taken 23 November 2026 at the user's request. Implementation stopped before the final verification pass. Continue from `main` in [karank-zignuts/ponomoly](https://github.com/karank-zignuts/ponomoly). The workspace was an empty checkout when this work started.

## Product requirements

- Build an original, complete, multiplayer property-trading game for the browser with an installable PWA. The user approved a warm, vintage Indian travel-poster style.
- Each purchasable city tile represents an entire Indian city. The user explicitly corrected an earlier neighbourhood-based draft. Keep tile names such as Mumbai, Ahmedabad, Chennai, Delhi, and Bengaluru, and show Indian rupees throughout. Railways and utilities are their own deed classes.
- The same room and seat must survive refresh, a connection drop, and server restarts. Humans can play with friends, with optional computer players, or solo against bots. A required human decision waits for that human to reconnect.
- Keep the board legible without overlapping labels or controls. Preserve space for the board itself, and make complete deeds, trade details, activity, and rules discoverable without permanently filling the screen.

## What is implemented

- **Board and economy** — 40 spaces, including 22 individual Indian cities, four railways, and two utilities. Eight colour sets follow citywide housing valuations. In-game purchase prices rise from ₹600 for Bhopal to ₹4,000 for Mumbai, with two- or three-city sets, tier-specific building costs, and separate schedules for rent and mortgages. City tile names changed late in development while the underlying space indices and purchase prices were retained so early local saves keep cash and ownership. Historical activity from earlier preview rooms may contain old names.
- **Game rules** — starting cash and opening dice, turn order, departure payment, doubles, Holding and release options, two 16-card decks, taxes, rent, direct purchases, auctions and passes, even development and building stock, mortgages, negotiated trades, debt resolution, bank or player bankruptcy, and last-player-standing victory. This is an original game with automatically collected rent and sequential bidding for smoother online decisions.
- **Rooms** — private invite codes, guest cookie tied to a seat, 2–6 seats, lobby host controls, signed-in-free joining, move rejection against stale room revisions, idempotency receipts for retries, reconnect/error UI and presence. A confirmed move is persisted before the client receives it. Local mode writes to SQLite; a Supabase adapter and migration provide shared durable storage and optional Realtime invalidation.
- **Bots** — the host can add or remove computer players before starting. Server-side logic estimates near-term rent exposure, reserves cash, values cities and set completion, adjusts auction bids and passes, picks investments and debt liquidation, decides when to stay in Holding, and proposes or evaluates trades. Bots use the same rule engine as humans and cannot see deck order. Each due move uses optimistic concurrency, so a simultaneous poll from several clients cannot apply it twice. An active room view drives due moves after a short delay. With every human away, a bot match resumes when someone returns.
- **UI and PWA** — play/join screen, accessible room and game controls, responsive illustrated board, property browser and deed dialogs, player roster, bank inventory, turn controls, trades, and activity. Dice and pawn motion respect reduced motion. Original generated illustration at `public/art/india.webp`. Manifest and install icons are present. The service worker registers in production, caches app assets, and shows an offline page on navigation; live moves require a connection.

## Key source files

| Path | Responsibility |
| --- | --- |
| `src/game/board.ts` | Tile order, 22 city benchmarks, colour tiers, prices, rent schedules, rupee formatter |
| `src/game/cards.ts` | Card copy and typed effects for both decks |
| `src/game/engine.ts` | Authoritative game actions and continuations across purchases, auctions and debt |
| `src/game/economy.ts` | Shared rent, stock, development, mortgage, and liquidity calculations |
| `src/game/bot.ts` | Bot decision-making from public match state |
| `src/server/room-store.ts` | SQLite and Supabase adapters, presence and revision-checked writes |
| `src/server/rooms.ts` | Seat membership, host actions, revision and receipt checks, bot scheduling |
| `src/server/rules-schema.ts` | Zod validation for all incoming actions |
| `src/app/api/rooms/[[...room]]/route.ts` | Room API, HttpOnly guest cookie, runtime request validation |
| `src/components/use-room.ts` | Polling, Realtime subscriptions, revisions, reconnect and retry |
| `src/components/board.tsx` | Grid, space details and token movement |
| `src/components/game-room.tsx`, `turn-panel.tsx` | Match views, panels and actions |
| `src/app/styles.css` | Shared styling and responsive rules |
| `src/app/manifest.ts`, `public/sw.js` | App installation and offline experience |
| `supabase/migrations/20261123000100_ponomoly_rooms.sql` | Room and presence tables, RLS and revision broadcast |
| `tests/engine.test.ts` | Rule, economy, strategy and full-match simulations |

## Run the current checkout

Requires Node.js 24 or later.

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3175
```

The dev server was already running at [127.0.0.1:3175](http://127.0.0.1:3175/) at handoff. Create a room, add a bot or open the invite in an incognito window, and start. Two tabs in the same browser profile share the guest seat by design. Leave `SUPABASE_*` unset to use the ignored `.data/ponomoly.sqlite` file. Set `PONOMOLY_DB_PATH` to isolate test rooms. Run `npm run build && npm start` on a separate port to verify service worker and installation behavior.

## Supabase and hosting

Target project ref: `wsuzgcswbtlgwhvkbyvz`. The signed-in Supabase CLI did not list this project. The hosted migration and deployment have not been applied. The user will set the secret from their end.

1. In the target project's SQL Editor, apply the checked-in migration once. As an alternative, link the Supabase CLI to the target project and push the migration from an account with access.
2. Set `SUPABASE_URL=https://wsuzgcswbtlgwhvkbyvz.supabase.co` and `SUPABASE_SECRET_KEY` in the host's server environment or in a local `.env.local` file for staging. A legacy service-role key is also supported. Keep it server-only and out of Git.
3. Set `SUPABASE_PUBLISHABLE_KEY` to use WebSocket notifications. If it is omitted, room sync falls back to polling. The WebSocket message contains a revision number and the room uses a random topic. Room snapshots are only served through the seat-authenticated API.
4. Deploy as a Next.js Node app. Vercel requires the Supabase storage configuration. For a single self-hosted process, SQLite requires a persistent disk. Repeat the multiplayer smoke test on the real deployed origin, including HTTPS installation and Realtime.

## Verification status and next steps

- The earlier desktop home rendered successfully in Chromium. The local home and manifest returned HTTP 200. The corrected city board and bot lobby have been implemented; the full browser job was not reached before the stop request.
- ESLint and TypeScript passed together after the bot implementation. One engine test run reported 21 passes out of 22, including four completed seeded full matches. The remaining bot fixture let nearby Civic Tax distort its intended cash-reserve scenario. The fixture was adjusted, and the suite has not been rerun since that edit.
- Start with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. If necessary, recheck the bot fixture in `tests/engine.test.ts`. `@playwright/test` is installed and the package has a test script, but a browser suite and config still need to be added.
- Smoke-test two independent browser contexts creating and joining the same room, buying or auctioning, trading, reloading mid-decision, and disconnecting then reconnecting. Verify the same seat and snapshot, rejection of stale or duplicate actions, and a match resumed after restart. Try human-versus-bot and a mixed room with multiple bots.
- Verify layouts and interaction at mobile widths, especially the longest city names, multiple tokens on the same space, trade controls, keyboard focus, and tap targets. Inspect a production browser build on Android and iOS for PWA installation behavior.
- Run the migration on the target Supabase project and verify its trigger, permissions, secret-key API access, and Realtime channel with two clients. Local SQLite smoke tests alone cannot verify the hosted adapter.
- The five-hour Codex window still had ample capacity on the last check. The stop was the user's explicit instruction.

## Market references

The city rankings use June 2026 four-quarter average valuation figures from [National Housing Bank RESIDEX](https://residex.nhbonline.org.in/), transcribed through [India in Data's city-level table](https://indiaindata.online/property-prices/). They establish rank and colour tiers. The displayed prices are board-game amounts. The earlier eight-metro PropTiger comparison was superseded for the whole-city board.
