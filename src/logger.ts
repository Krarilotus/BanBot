import { type Client, type Message } from "discord.js";
import { version as discordJsVersion } from "discord.js";
import pkg from "../package.json" with { type: "json" };
import type { Config } from "./config.js";
import { effectiveActionMode, type GuildConfig } from "./guild-config.js";
import type { TrapResult } from "./trap.js";

const maxDiscordLogLength = 1_800;

export class Logger {
  constructor(private readonly client: Client) {}

  info(message: string, data: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", message, ...data }));
  }

  warn(message: string, data: Record<string, unknown> = {}): void {
    console.warn(JSON.stringify({ time: new Date().toISOString(), level: "warn", message, ...data }));
  }

  error(message: string, data: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ time: new Date().toISOString(), level: "error", message, ...data }));
  }

  startup(config: Config): void {
    this.info("Discord Trap Ban Bot started", {
      version: pkg.version,
      nodeVersion: process.version,
      discordJsVersion,
      defaultActionMode: config.defaultActionMode,
      defaultDeleteMessageSeconds: config.defaultDeleteMessageSeconds,
      runtimeConfigPath: config.runtimeConfigPath,
    });
  }

  async notifyBan(message: Message): Promise<void> {
    try {
      if (message.channel.isTextBased() && "send" in message.channel) {
        await message.channel.send({
          content: `${message.author.tag} banned`,
          allowedMentions: { parse: [] },
        });
      }
    } catch (error) {
      this.warn("Could not notify trap channel", { error: String(error) });
    }
  }

  async logAction(message: Message, guildConfig: GuildConfig, result: TrapResult): Promise<void> {
    const payload = {
      guild: message.guild?.name,
      guildId: message.guildId,
      actionMode: effectiveActionMode(guildConfig),
      user: message.author.tag,
      userId: message.author.id,
      channelId: message.channelId,
      result: result.kind,
      reason: result.reason,
      deleteMessageSeconds: guildConfig.deleteMessageSeconds,
    };

    if (result.kind === "failed") {
      this.error("trap action failed", { ...payload, error: result.error ? String(result.error) : undefined });
    } else {
      this.info("trap action", payload);
    }

    if (!guildConfig.logChannelId) return;
    await this.sendDiscordLog(guildConfig.logChannelId, JSON.stringify(payload));
  }

  private async sendDiscordLog(channelId: string, content: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !("send" in channel)) {
        this.warn("Configured log channel is not sendable", { channelId });
        return;
      }
      await channel.send({
        content: content.slice(0, maxDiscordLogLength),
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      this.warn("Could not send Discord log", { channelId, error: String(error) });
    }
  }
}
