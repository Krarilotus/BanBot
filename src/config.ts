import "dotenv/config";

export type ActionMode = "dry-run" | "ban";

export interface Config {
  discordToken: string;
  clientId?: string;
  trapChannelIds: Set<string>;
  logChannelId?: string;
  actionMode: ActionMode;
  deleteMessageSeconds: number;
  healthHost: string;
  healthPort?: number;
}

const snowflakePattern = /^\d{17,20}$/;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseSnowflakeList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = [];
  const discordToken = optional(env.DISCORD_TOKEN);
  const clientId = optional(env.CLIENT_ID);
  const logChannelId = optional(env.LOG_CHANNEL_ID);
  const trapChannelIds = parseSnowflakeList(env.TRAP_CHANNEL_IDS);
  const rawActionMode = optional(env.ACTION_MODE) ?? "dry-run";
  const rawDeleteSeconds = optional(env.DELETE_MESSAGE_SECONDS) ?? "86400";
  const confirmConfig = optional(env.CONFIRM_CONFIG) ?? "false";
  const healthHost = optional(env.HEALTH_HOST) ?? "127.0.0.1";
  const rawHealthPort = optional(env.HEALTH_PORT);

  if (!discordToken) errors.push("DISCORD_TOKEN is required");
  if (clientId && !snowflakePattern.test(clientId)) errors.push("CLIENT_ID must look like a Discord snowflake");
  if (trapChannelIds.length === 0) errors.push("TRAP_CHANNEL_IDS is required");
  for (const id of trapChannelIds) {
    if (!snowflakePattern.test(id)) errors.push(`TRAP_CHANNEL_IDS contains invalid ID: ${id}`);
  }
  if (logChannelId && !snowflakePattern.test(logChannelId)) {
    errors.push("LOG_CHANNEL_ID must look like a Discord snowflake");
  }
  if (rawActionMode !== "dry-run" && rawActionMode !== "ban") {
    errors.push("ACTION_MODE must be exactly dry-run or ban");
  }

  const deleteMessageSeconds = Number(rawDeleteSeconds);
  if (!Number.isInteger(deleteMessageSeconds) || deleteMessageSeconds < 0 || deleteMessageSeconds > 604800) {
    errors.push("DELETE_MESSAGE_SECONDS must be an integer between 0 and 604800");
  }

  let healthPort: number | undefined;
  if (rawHealthPort) {
    healthPort = Number(rawHealthPort);
    if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535) {
      errors.push("HEALTH_PORT must be empty or an integer between 1 and 65535");
    }
  }

  if (rawActionMode === "ban" && confirmConfig !== "true") {
    errors.push("ACTION_MODE=ban requires CONFIRM_CONFIG=true");
  }

  if (errors.length > 0 || !discordToken || (rawActionMode !== "dry-run" && rawActionMode !== "ban")) {
    throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);
  }

  const config: Config = {
    discordToken,
    trapChannelIds: new Set(trapChannelIds),
    actionMode: rawActionMode,
    deleteMessageSeconds,
    healthHost,
  };
  if (clientId) config.clientId = clientId;
  if (logChannelId) config.logChannelId = logChannelId;
  if (healthPort) config.healthPort = healthPort;
  return config;
}
