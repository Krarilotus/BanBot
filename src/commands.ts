import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Config } from "./config.js";
import { defaultsForGuild, effectiveActionMode, type GuildConfig, type GuildConfigStore } from "./guild-config.js";

export const banbotHelp = [
  "BanBot setup:",
  "1. Run `/banbot setup trap_channel:#your-trap-channel`.",
  "2. Keep mode as dry-run while testing.",
  "3. When dry-run logs look right, run `/banbot setup mode:ban confirm_ban_mode:enable ban mode`.",
  "4. The bot only bans human users with no roles except @everyone.",
  "5. The bot ignores its own messages, bots, webhooks, and users with any real role.",
].join("\n");

export function buildBanbotCommand(): SlashCommandSubcommandsOnlyBuilder {
  return new SlashCommandBuilder()
    .setName("banbot")
    .setDescription("Configure and inspect BanBot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("help").setDescription("Show BanBot setup help"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Show this server's BanBot configuration"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Configure BanBot for this server")
        .addChannelOption((option) =>
          option
            .setName("trap_channel")
            .setDescription("Channel where roleless users are banned when they post")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("log_channel")
            .setDescription("Optional channel for compact action logs")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("dry-run logs only; ban actually bans")
            .addChoices({ name: "dry-run", value: "dry-run" }, { name: "ban", value: "ban" })
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("delete_seconds")
            .setDescription("How many seconds of recent messages Discord should delete, max 604800")
            .setMinValue(0)
            .setMaxValue(604800)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("confirm_ban_mode")
            .setDescription('Required for mode ban: type "enable ban mode"')
            .setRequired(false),
        ),
    );
}

export async function handleBanbotInteraction(
  interaction: ChatInputCommandInteraction,
  appConfig: Config,
  store: GuildConfigStore,
): Promise<void> {
  if (interaction.commandName !== "banbot") return;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Use this command inside a server.", ephemeral: true });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "You need Manage Server permission to configure BanBot.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "help") {
    await interaction.reply({ content: banbotHelp, ephemeral: true });
    return;
  }

  const existing = await store.get(interaction.guildId);
  if (subcommand === "status") {
    await interaction.reply({ content: formatStatus(existing), ephemeral: true });
    return;
  }

  const next = existing ?? defaultsForGuild(interaction.guildId, appConfig, interaction.user.id);
  const trapChannel = interaction.options.getChannel("trap_channel");
  const logChannel = interaction.options.getChannel("log_channel");
  const mode = interaction.options.getString("mode");
  const deleteSeconds = interaction.options.getInteger("delete_seconds");
  const confirmBanMode = interaction.options.getString("confirm_ban_mode");

  if (trapChannel) next.trapChannelIds = [trapChannel.id];
  if (logChannel) next.logChannelId = logChannel.id;
  if (mode === "dry-run" || mode === "ban") next.actionMode = mode;
  if (typeof deleteSeconds === "number") next.deleteMessageSeconds = deleteSeconds;
  next.banConfirmed = next.actionMode === "ban" && confirmBanMode === "enable ban mode";
  if (next.actionMode !== "ban") next.banConfirmed = false;
  next.updatedAt = new Date().toISOString();
  next.updatedBy = interaction.user.id;

  await store.set(interaction.guildId, next);
  await interaction.reply({ content: `Saved BanBot configuration.\n\n${formatStatus(next)}`, ephemeral: true });
}

export function formatStatus(config: GuildConfig | undefined): string {
  if (!config) return "BanBot is not configured for this server yet. Run `/banbot setup trap_channel:#channel`.";
  const trapChannels = config.trapChannelIds.length > 0 ? config.trapChannelIds.map((id) => `<#${id}>`).join(", ") : "not set";
  const logChannel = config.logChannelId ? `<#${config.logChannelId}>` : "disabled";
  return [
    `Trap channels: ${trapChannels}`,
    `Log channel: ${logChannel}`,
    `Mode: ${effectiveActionMode(config)}${config.actionMode === "ban" && !config.banConfirmed ? " (ban requested but not confirmed)" : ""}`,
    `Delete seconds: ${config.deleteMessageSeconds}`,
    `Updated: ${config.updatedAt}`,
  ].join("\n");
}
