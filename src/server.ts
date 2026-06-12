import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { platform } from "node:process";

export interface StaticServerOptions {
  root: string;
  host: string;
  port: number;
}

export interface StaticServerHandle {
  url: string;
  close(): Promise<void>;
}

export interface StaticResponse {
  status: number;
  contentType: string;
  body: string;
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function isInsideRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

export function resolveStaticPath(root: string, requestPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath.split("?", 1)[0] || "/");
  } catch {
    return null;
  }

  if (decodedPath.includes("\0")) return null;
  const relativePath = decodedPath === "/" ? "/index.html" : decodedPath;
  const rootPath = resolve(root);
  const filePath = resolve(rootPath, `.${relativePath}`);
  if (!isInsideRoot(rootPath, filePath)) return null;
  return filePath;
}

export function readStaticResponse(root: string, requestPath: string): StaticResponse {
  const filePath = resolveStaticPath(root, requestPath);
  if (!filePath || !existsSync(filePath)) {
    return {
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Not found",
    };
  }

  return {
    status: 200,
    contentType: contentType(filePath),
    body: readFileSync(filePath, "utf8"),
  };
}

export function createStaticServer(options: StaticServerOptions): Promise<StaticServerHandle> {
  const root = resolve(options.root);
  const server = createServer((request, response) => {
    const staticResponse = readStaticResponse(root, request.url || "/");
    response.writeHead(staticResponse.status, { "content-type": staticResponse.contentType });
    response.end(staticResponse.body);
  });

  return new Promise((resolveHandle, reject) => {
    server.on("error", reject);
    server.listen(options.port, options.host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine server address"));
        return;
      }
      const host = address.address === "0.0.0.0" ? "127.0.0.1" : address.address;
      resolveHandle({
        url: `http://${host}:${address.port}/`,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) rejectClose(error);
              else resolveClose();
            });
          }),
      });
    });
  });
}

export function openUrl(url: string): void {
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}
