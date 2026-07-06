import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type Guild,
  type ChatInputCommandInteraction,
} from "discord.js";
import { buildBanbotCommand, handleBanbotInteraction } from "./commands.js";
import { loadConfig } from "./config.js";
import { GuildConfigStore } from "./guild-config.js";
import { startHealthServer } from "./health.js";
import { Logger } from "./logger.js";
import { handleTrapMessage } from "./trap.js";

async function registerCommands(config: ReturnType<typeof loadConfig>, logger: Logger): Promise<void> {
  if (!config.clientId) {
    logger.warn("CLIENT_ID is not set; /banbot will not be registered");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const body = [buildBanbotCommand().toJSON()];
  await rest.put(Routes.applicationCommands(config.clientId), { body });
  logger.info("Registered global /banbot command");
}

async function registerGuildCommands(
  guilds: Iterable<Guild>,
  config: ReturnType<typeof loadConfig>,
  logger: Logger,
): Promise<void> {
  if (!config.clientId) return;

  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const body = [buildBanbotCommand().toJSON()];
  for (const guild of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(config.clientId, guild.id), { body });
      logger.info("Registered guild /banbot command", { guild: guild.name, guildId: guild.id });
    } catch (error) {
      logger.warn("Could not register guild /banbot command", { guild: guild.name, guildId: guild.id, error: String(error) });
    }
  }
}

async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  config: ReturnType<typeof loadConfig>,
  store: GuildConfigStore,
): Promise<void> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "banbot") return;
  await handleBanbotInteraction(interaction, config, store);
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
  const store = new GuildConfigStore(config.runtimeConfigPath);
  let ready = false;
  const healthServer = startHealthServer(config, () => ready);

  client.once(Events.ClientReady, async (readyClient) => {
    ready = true;
    logger.startup(config);
    logger.info("Discord client ready", { user: readyClient.user.tag });
    try {
      await registerCommands(config, logger);
      await registerGuildCommands(readyClient.guilds.cache.values(), config, logger);
    } catch (error) {
      logger.warn("Could not register /banbot command", { error: String(error) });
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    await registerGuildCommands([guild], config, logger);
  });

  client.on(Events.MessageCreate, async (message) => {
    await handleTrapMessage(message, message.guildId ? await store.get(message.guildId) : undefined, logger);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await handleInteraction(interaction, config, store);
    } catch (error) {
      logger.error("Interaction failed", { command: interaction.commandName, error: String(error) });
      const content = "BanBot hit an internal error. Check the server logs with `/home/banbot/BanBot/status.sh`.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => undefined);
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
      }
    }
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
