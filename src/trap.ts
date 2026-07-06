import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import { effectiveActionMode, type GuildConfig } from "./guild-config.js";
import type { Logger } from "./logger.js";

export type TrapResult =
  | { kind: "ignored"; reason: string }
  | { kind: "dry-run"; userId: string; reason: string }
  | { kind: "banned"; userId: string; reason: string }
  | { kind: "kicked"; userId: string; reason: string }
  | { kind: "failed"; userId?: string; reason: string; error?: unknown };

const inFlight = new Set<string>();

export function hasAnyNonEveryoneRole(guildId: string, roleIds: Iterable<string>): boolean {
  for (const roleId of roleIds) {
    if (roleId !== guildId) return true;
  }
  return false;
}

function releaseLater(key: string): void {
  setTimeout(() => inFlight.delete(key), 60_000).unref();
}

async function getMember(message: Message): Promise<GuildMember> {
  if (message.member) return message.member;
  return message.guild!.members.fetch(message.author.id);
}

export async function handleTrapMessage(message: Message, guildConfig: GuildConfig | undefined, logger: Logger): Promise<TrapResult> {
  if (!message.guild) return { kind: "ignored", reason: "not a guild message" };
  if (!guildConfig) return { kind: "ignored", reason: "guild not configured" };
  if (!guildConfig.trapChannelIds.includes(message.channelId)) return { kind: "ignored", reason: "not a trap channel" };
  if (message.author.bot) return { kind: "ignored", reason: "bot author" };
  if (message.client.user?.id === message.author.id) return { kind: "ignored", reason: "self message" };
  if (message.webhookId) return { kind: "ignored", reason: "webhook message" };

  const key = `${message.guild.id}:${message.author.id}`;
  if (inFlight.has(key)) return { kind: "ignored", reason: "action already in flight" };
  inFlight.add(key);

  try {
    const member = await getMember(message);
    const hasRoles = hasAnyNonEveryoneRole(message.guild.id, member.roles.cache.keys());
    const roleUserAction = guildConfig.roleUserAction ?? "ignore";

    const botMember = message.guild.members.me ?? (await message.guild.members.fetchMe());
    if (hasRoles && roleUserAction === "ignore") {
      return { kind: "ignored", reason: "user has a non-everyone role" };
    }

    if (hasRoles && roleUserAction === "kick") {
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        const result = { kind: "failed" as const, userId: message.author.id, reason: "bot lacks Ban Members permission for role-user soft-kick" };
        await logger.logAction(message, guildConfig, result);
        return result;
      }
      if (!member.bannable) {
        const result = { kind: "failed" as const, userId: message.author.id, reason: "target member is not soft-kickable" };
        await logger.logAction(message, guildConfig, result);
        return result;
      }
      if (effectiveActionMode(guildConfig) === "dry-run") {
        const result = { kind: "dry-run" as const, userId: message.author.id, reason: "would soft-kick user with roles and delete recent messages" };
        await logger.logAction(message, guildConfig, result);
        return result;
      }
      await member.ban({
        deleteMessageSeconds: guildConfig.roleUserDeleteMessageSeconds ?? 600,
        reason: `Trap channel soft-kick: ${message.channelId}; user had roles`,
      });
      await message.guild.members.unban(message.author.id, `Trap channel soft-kick release: ${message.channelId}`);
      const result = { kind: "kicked" as const, userId: message.author.id, reason: "soft-kicked user with roles and deleted recent messages" };
      await logger.logAction(message, guildConfig, result);
      return result;
    }

    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
      const result = { kind: "failed" as const, userId: message.author.id, reason: "bot lacks Ban Members permission" };
      await logger.logAction(message, guildConfig, result);
      return result;
    }

    if (!member.bannable) {
      const result = { kind: "failed" as const, userId: message.author.id, reason: "target member is not bannable" };
      await logger.logAction(message, guildConfig, result);
      return result;
    }

    if (effectiveActionMode(guildConfig) === "dry-run") {
      const result = {
        kind: "dry-run" as const,
        userId: message.author.id,
        reason: hasRoles ? "would ban user with roles in trap channel" : "would ban roleless user in trap channel",
      };
      await logger.logAction(message, guildConfig, result);
      return result;
    }

    await member.ban({
      deleteMessageSeconds: guildConfig.deleteMessageSeconds,
      reason: hasRoles
        ? `Trap channel hit: ${message.channelId}; user had roles`
        : `Trap channel hit: ${message.channelId}; user had only @everyone`,
    });

    await logger.notifyBan(message);
    const result = {
      kind: "banned" as const,
      userId: message.author.id,
      reason: hasRoles ? "banned user with roles in trap channel" : "banned roleless user in trap channel",
    };
    await logger.logAction(message, guildConfig, result);
    return result;
  } catch (error) {
    const result = { kind: "failed" as const, userId: message.author.id, reason: "unexpected error", error };
    if (guildConfig) await logger.logAction(message, guildConfig, result);
    return result;
  } finally {
    releaseLater(key);
  }
}
