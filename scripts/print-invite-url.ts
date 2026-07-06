import "dotenv/config";
import { PermissionFlagsBits } from "discord.js";

const clientId = process.env.CLIENT_ID ?? process.argv[2];

if (!clientId || !/^\d{17,20}$/.test(clientId)) {
  console.error("Set CLIENT_ID in .env or pass it as the first argument.");
  process.exit(1);
}

const permissions =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.SendMessages;

const params = new URLSearchParams({
  client_id: clientId,
  permissions: permissions.toString(),
  integration_type: "0",
  scope: "bot applications.commands",
});

console.log(`https://discord.com/oauth2/authorize?${params.toString()}`);
