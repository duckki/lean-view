declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(fn: () => unknown, expected?: RegExp, message?: string): void;
  };
  export default assert;
}

declare module "node:child_process" {
  export interface ChildProcess {
    unref(): void;
  }

  export interface SpawnSyncResult {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }

  export function spawnSync(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      encoding?: string;
      input?: string;
      stdio?: string | string[];
    }
  ): SpawnSyncResult;

  export function spawn(
    command: string,
    args?: string[],
    options?: {
      detached?: boolean;
      stdio?: string | string[];
    }
  ): ChildProcess;
}

declare module "node:fs" {
  export function copyFileSync(source: string, destination: string): void;
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function realpathSync(path: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding?: "utf8"): void;
}

declare module "node:http" {
  export interface IncomingMessage {
    url?: string;
  }

  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    end(data?: string | Uint8Array): void;
  }

  export interface AddressInfo {
    address: string;
    family: string;
    port: number;
  }

  export interface Server {
    address(): AddressInfo | string | null;
    close(callback?: (error?: Error) => void): void;
    listen(port: number, host: string, callback?: () => void): void;
    on(event: "error", callback: (error: Error) => void): void;
  }

  export function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void,
  ): Server;
}

declare module "node:path" {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
  export const sep: string;
}

declare module "node:process" {
  export const argv: string[];
  export function cwd(): string;
  export function exit(code?: number): never;
  export const platform: string;
  export const stderr: { write(message: string): void };
  export const stdout: { write(message: string): void };
  export const version: string;
}

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

interface ImportMeta {
  readonly url: string;
}

declare function fetch(input: string): Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;
