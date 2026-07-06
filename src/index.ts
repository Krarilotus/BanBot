import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { loadConfig } from "./config.js";
import { banbotHelp } from "./help.js";
import { startHealthServer } from "./health.js";
import { Logger } from "./logger.js";
import { handleTrapMessage } from "./trap.js";

async function registerCommands(config: ReturnType<typeof loadConfig>, logger: Logger): Promise<void> {
  if (!config.clientId) {
    logger.warn("CLIENT_ID is not set; /banbot will not be registered");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const command = new SlashCommandBuilder().setName("banbot").setDescription("Show Trap Ban Bot setup instructions");
  await rest.put(Routes.applicationCommands(config.clientId), { body: [command.toJSON()] });
  logger.info("Registered /banbot command");
}

async function handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "banbot") return;
  await interaction.reply({ content: banbotHelp, ephemeral: true });
}

async function main(): Promise<void> {
  if (process.argv[2] === "validate-config") {
    loadConfig();
    console.log("Configuration is valid.");
    return;
  }

  const config = loadConfig();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
  const logger = new Logger(client);
  let ready = false;
  const healthServer = startHealthServer(config, () => ready);

  client.once(Events.ClientReady, async (readyClient) => {
    ready = true;
    logger.startup(config);
    logger.info("Discord client ready", { user: readyClient.user.tag });
    try {
      await registerCommands(config, logger);
    } catch (error) {
      logger.warn("Could not register /banbot command", { error: String(error) });
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    await handleTrapMessage(message, config, logger);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) await handleInteraction(interaction);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info("Shutting down", { signal });
    ready = false;
    healthServer?.close();
    client.destroy();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await client.login(config.discordToken);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
