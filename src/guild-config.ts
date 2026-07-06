import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ActionMode, Config } from "./config.js";

export type RoleUserAction = "ignore" | "kick" | "ban";

export interface GuildConfig {
  guildId: string;
  trapChannelIds: string[];
  logChannelId?: string;
  actionMode: ActionMode;
  roleUserAction: RoleUserAction;
  roleUserDeleteMessageSeconds: number;
  deleteMessageSeconds: number;
  banConfirmed: boolean;
  updatedAt: string;
  updatedBy: string;
}

interface RuntimeConfigFile {
  guilds: Record<string, GuildConfig>;
}

const emptyFile: RuntimeConfigFile = { guilds: {} };

export class GuildConfigStore {
  constructor(private readonly path: string) {}

  async get(guildId: string): Promise<GuildConfig | undefined> {
    return (await this.read()).guilds[guildId];
  }

  async set(guildId: string, guildConfig: GuildConfig): Promise<void> {
    const file = await this.read();
    file.guilds[guildId] = guildConfig;
    await this.write(file);
  }

  async read(): Promise<RuntimeConfigFile> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as RuntimeConfigFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...emptyFile };
      throw error;
    }
  }

  private async write(file: RuntimeConfigFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
    await rename(tmp, this.path);
  }
}

export function defaultsForGuild(guildId: string, config: Config, updatedBy: string): GuildConfig {
  return {
    guildId,
    trapChannelIds: [],
    actionMode: config.defaultActionMode,
    roleUserAction: "ignore",
    roleUserDeleteMessageSeconds: 600,
    deleteMessageSeconds: config.defaultDeleteMessageSeconds,
    banConfirmed: false,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
}

export function effectiveActionMode(guildConfig: GuildConfig): ActionMode {
  return guildConfig.actionMode === "ban" && guildConfig.banConfirmed ? "ban" : "dry-run";
}
