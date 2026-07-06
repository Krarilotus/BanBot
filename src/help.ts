export const banbotHelp = [
  "Discord Trap Ban Bot setup:",
  "1. Create a Discord application and bot in the Developer Portal.",
  "2. Do not enable Message Content, Server Members, or Presence privileged intents.",
  "3. Invite the bot with View Channels, Ban Members, and Send Messages.",
  "4. Put trap channel IDs in TRAP_CHANNEL_IDS.",
  "5. Start in ACTION_MODE=dry-run, test, then switch to ACTION_MODE=ban and CONFIRM_CONFIG=true.",
  "6. Make sure the bot role is high enough to ban roleless users.",
].join("\n");
