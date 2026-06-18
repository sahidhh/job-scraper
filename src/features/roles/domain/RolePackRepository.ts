import type { RolePack } from "./types";

export interface RolePackRepository {
  getAll(): Promise<RolePack[]>;
  getById(id: string): Promise<RolePack | null>;
}
