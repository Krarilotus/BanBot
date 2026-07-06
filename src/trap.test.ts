import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "discord.js";
import type { GuildConfig } from "./guild-config.js";
import type { Logger } from "./logger.js";
import { handleTrapMessage, hasAnyNonEveryoneRole } from "./trap.js";

describe("hasAnyNonEveryoneRole", () => {
  it("returns false for only @everyone", () => {
    assert.equal(hasAnyNonEveryoneRole("guild", ["guild"]), false);
  });

  it("returns true when any other role exists", () => {
    assert.equal(hasAnyNonEveryoneRole("guild", ["guild", "role"]), true);
  });

  it("returns false for an empty iterable", () => {
    assert.equal(hasAnyNonEveryoneRole("guild", []), false);
  });
});

function guildConfig(overrides: Partial<GuildConfig> = {}): GuildConfig {
  return {
    guildId: "guild-id",
    trapChannelIds: ["trap-channel"],
    actionMode: "dry-run",
    roleUserAction: "ignore",
    roleUserDeleteMessageSeconds: 600,
    banConfirmed: false,
    deleteMessageSeconds: 86400,
    updatedAt: "2026-07-06T00:00:00.000Z",
    updatedBy: "admin-id",
    ...overrides,
  };
}

function logger() {
  const calls: string[] = [];
  return {
    calls,
    instance: {
      logAction: async () => {
        calls.push("logAction");
      },
      notifyTrapChannel: async (_message: unknown, action: "banned" | "kicked") => {
        calls.push(`notify:${action}`);
      },
    } as unknown as Logger,
  };
}

function message(options: {
  authorId?: string;
  authorBot?: boolean;
  botUserId?: string;
  channelId?: string;
  webhookId?: string | null;
  roleIds?: string[];
  bannable?: boolean;
  botCanBan?: boolean;
  botCanKick?: boolean;
  ban?: () => Promise<void>;
  kick?: () => Promise<void>;
  unban?: () => Promise<void>;
} = {}): Message {
  const guildId = "guild-id";
  const authorId = options.authorId ?? "user-id";
  const roleIds = options.roleIds ?? [guildId];

  return {
    guildId,
    channelId: options.channelId ?? "trap-channel",
    webhookId: options.webhookId ?? null,
    client: { user: { id: options.botUserId ?? "bot-id" } },
    author: {
      id: authorId,
      bot: options.authorBot ?? false,
      tag: "test-user#0000",
    },
    guild: {
      id: guildId,
      name: "Test Guild",
      members: {
        me: {
          permissions: {
            has: (permission: bigint) => {
              if (permission === 2n) return options.botCanKick ?? true;
              if (permission === 4n) return options.botCanBan ?? true;
              return true;
            },
          },
        },
        fetchMe: async () => ({
          permissions: {
            has: (permission: bigint) => {
              if (permission === 2n) return options.botCanKick ?? true;
              if (permission === 4n) return options.botCanBan ?? true;
              return true;
            },
          },
        }),
        fetch: async () => ({ id: authorId }),
        unban: options.unban ?? (async () => undefined),
      },
    },
    member: {
      roles: {
        cache: {
          keys: () => roleIds.values(),
        },
      },
      bannable: options.bannable ?? true,
      kickable: options.bannable ?? true,
      ban: options.ban ?? (async () => undefined),
      kick: options.kick ?? (async () => undefined),
    },
  } as unknown as Message;
}

describe("handleTrapMessage", () => {
  it("ignores bot-authored trap messages so the bot never reacts to its own notification", async () => {
    let banCalls = 0;
    const logs = logger();

    const result = await handleTrapMessage(
      message({
        authorId: "bot-id",
        authorBot: true,
        botUserId: "bot-id",
        ban: async () => {
          banCalls += 1;
        },
      }),
      guildConfig({ actionMode: "ban", banConfirmed: true }),
      logs.instance,
    );

    assert.deepEqual(result, { kind: "ignored", reason: "bot author" });
    assert.equal(banCalls, 0);
    assert.deepEqual(logs.calls, []);
  });

  it("ignores self messages even if a malformed mock/event did not mark the author as a bot", async () => {
    let banCalls = 0;
    const logs = logger();

    const result = await handleTrapMessage(
      message({
        authorId: "bot-id",
        authorBot: false,
        botUserId: "bot-id",
        ban: async () => {
          banCalls += 1;
        },
      }),
      guildConfig({ actionMode: "ban", banConfirmed: true }),
      logs.instance,
    );

    assert.deepEqual(result, { kind: "ignored", reason: "self message" });
    assert.equal(banCalls, 0);
    assert.deepEqual(logs.calls, []);
  });

  it("dry-runs roleless users in trap channels by default", async () => {
    const logs = logger();

    const result = await handleTrapMessage(message({ authorId: "dry-run-user" }), guildConfig(), logs.instance);

    assert.equal(result.kind, "dry-run");
    assert.equal(result.userId, "dry-run-user");
    assert.deepEqual(logs.calls, ["logAction"]);
  });

  it("ignores users with any non-everyone role", async () => {
    const logs = logger();

    const result = await handleTrapMessage(
      message({ authorId: "approved-user", roleIds: ["guild-id", "member-role"] }),
      guildConfig(),
      logs.instance,
    );

    assert.deepEqual(result, { kind: "ignored", reason: "user has a non-everyone role" });
    assert.deepEqual(logs.calls, []);
  });

  it("dry-runs kicking users with roles when configured", async () => {
    const logs = logger();
    let banCalls = 0;

    const result = await handleTrapMessage(
      message({
        authorId: "role-user-dry-run",
        roleIds: ["guild-id", "member-role"],
        ban: async () => {
          banCalls += 1;
        },
      }),
      guildConfig({ roleUserAction: "kick" }),
      logs.instance,
    );

    assert.equal(result.kind, "dry-run");
    assert.equal(banCalls, 0);
    assert.deepEqual(logs.calls, ["logAction"]);
  });

  it("soft-kicks users with roles in ban mode and deletes recent messages", async () => {
    const logs = logger();
    let banOptions: unknown;
    let unbanReason: unknown;

    const result = await handleTrapMessage(
      message({
        authorId: "role-user-kick",
        roleIds: ["guild-id", "member-role"],
        ban: async (options?: unknown) => {
          banOptions = options;
        },
        unban: async (_userId?: unknown, reason?: unknown) => {
          unbanReason = reason;
        },
      }),
      guildConfig({ actionMode: "ban", banConfirmed: true, roleUserAction: "kick" }),
      logs.instance,
    );

    assert.equal(result.kind, "kicked");
    assert.deepEqual(banOptions, {
      deleteMessageSeconds: 600,
      reason: "Trap channel soft-kick: trap-channel; user had roles",
    });
    assert.equal(unbanReason, "Trap channel soft-kick release: trap-channel");
    assert.deepEqual(logs.calls, ["notify:kicked", "logAction"]);
  });

  it("uses configured role-user message deletion seconds for soft-kicks", async () => {
    const logs = logger();
    let banOptions: unknown;

    const result = await handleTrapMessage(
      message({
        authorId: "role-user-kick-custom-delete",
        roleIds: ["guild-id", "member-role"],
        ban: async (options?: unknown) => {
          banOptions = options;
        },
      }),
      guildConfig({
        actionMode: "ban",
        banConfirmed: true,
        roleUserAction: "kick",
        roleUserDeleteMessageSeconds: 300,
      }),
      logs.instance,
    );

    assert.equal(result.kind, "kicked");
    assert.deepEqual(banOptions, {
      deleteMessageSeconds: 300,
      reason: "Trap channel soft-kick: trap-channel; user had roles",
    });
  });

  it("fails role-user soft-kick when the bot lacks Ban Members", async () => {
    const logs = logger();

    const result = await handleTrapMessage(
      message({
        authorId: "role-user-no-kick-permission",
        roleIds: ["guild-id", "member-role"],
        botCanBan: false,
      }),
      guildConfig({ actionMode: "ban", banConfirmed: true, roleUserAction: "kick" }),
      logs.instance,
    );

    assert.deepEqual(result, {
      kind: "failed",
      userId: "role-user-no-kick-permission",
      reason: "bot lacks Ban Members permission for role-user soft-kick",
    });
    assert.deepEqual(logs.calls, ["logAction"]);
  });

  it("bans roleless users in ban mode and requests recent message deletion", async () => {
    const logs = logger();
    let banOptions: unknown;

    const result = await handleTrapMessage(
      message({
        authorId: "ban-user",
        ban: async (options?: unknown) => {
          banOptions = options;
        },
      }),
      guildConfig({ actionMode: "ban", banConfirmed: true, deleteMessageSeconds: 123 }),
      logs.instance,
    );

    assert.equal(result.kind, "banned");
    assert.deepEqual(banOptions, {
      deleteMessageSeconds: 123,
      reason: "Trap channel hit: trap-channel; user had only @everyone",
    });
    assert.deepEqual(logs.calls, ["notify:banned", "logAction"]);
  });

  it("does not ban when ban mode was selected but not confirmed", async () => {
    const logs = logger();
    let banCalls = 0;

    const result = await handleTrapMessage(
      message({
        authorId: "unconfirmed-ban-user",
        ban: async () => {
          banCalls += 1;
        },
      }),
      guildConfig({ actionMode: "ban", banConfirmed: false }),
      logs.instance,
    );

    assert.equal(result.kind, "dry-run");
    assert.equal(banCalls, 0);
  });
});
