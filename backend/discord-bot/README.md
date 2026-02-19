# BeastyPage Discord Bot

## Setup

Create `backend/discord-bot/.env.local`:

```bash
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=... # optional, required for guild deploy/clear
FRONTEND_API_URL=https://beastyrabbit.com
```

## Command Contexts

- DM/private-channel-enabled slash commands:
  - `/cat`
  - `/gen-discord-kitten`
  - `/palette`
- Guild-only commands:
  - `/config`
  - `/homepage`
- `Extract Palette` message context command:
  - Guild, bot DM, and private channels

## Deploy Commands

From `backend/discord-bot`:

```bash
npm run deploy-commands
```

Default behavior deploys **global** commands.

Optional scope flags:

```bash
npm run deploy-commands -- --deploy-global
npm run deploy-commands -- --deploy-guild
```

Clear commands:

```bash
npm run deploy-commands -- --clear-global
npm run deploy-commands -- --clear-guild
```

## DM Rollout Sequence

If commands were previously registered as guild-only and DMs are not showing updated command availability:

1. Clear guild commands:
   ```bash
   npm run deploy-commands -- --clear-guild
   ```
2. Deploy global commands:
   ```bash
   npm run deploy-commands -- --deploy-global
   ```

Global command propagation can take some time on Discord before all clients reflect updates.

## Private Channel Support Requirements

To use app commands in private channels beyond DM-with-bot (for example group DMs), Discord requires user install support:

1. Discord Developer Portal -> Installation:
   - Enable User Install.
2. Default Install Settings:
   - Include `applications.commands` for User Install.
3. Re-authorize/install the app for user install ("Add to Apps").
