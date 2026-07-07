// Ambient types for the small slice of Node builtins the purity guard test uses. tsconfig omits
// @types/node; these are declarations only — the runtime supplies the real modules (no new dep).
declare module "node:fs" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
  }
  export function readdirSync(path: string, opts: { withFileTypes: true }): Dirent[];
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}
