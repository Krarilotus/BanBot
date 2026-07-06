import http, { type Server } from "node:http";
import type { Config } from "./config.js";

export function startHealthServer(config: Config, isReady: () => boolean): Server | undefined {
  if (!config.healthPort) return undefined;

  const server = http.createServer((request, response) => {
    if (request.url !== "/healthz") {
      response.writeHead(404).end("not found\n");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, ready: isReady(), defaultMode: config.defaultActionMode }) + "\n");
  });

  server.listen(config.healthPort, config.healthHost);
  return server;
}
