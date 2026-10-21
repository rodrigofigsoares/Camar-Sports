import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { createApi } from "./api.ts";
const api = createApi(),
  root = resolve("dist");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer((req, res) => {
  void api.handle(req, res, () => {
    const path = resolve(
      root,
      "." + new URL(req.url ?? "/", "http://localhost").pathname,
    );
    if (!path.startsWith(root + sep) && path !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    const file =
      existsSync(path) && statSync(path).isFile()
        ? path
        : resolve(root, "index.html");
    if (!existsSync(file)) {
      res.writeHead(503);
      res.end("Execute npm run build.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(res);
  });
});
server.listen(
  Number(process.env.PORT ?? 4173),
  process.env.HOST ?? "127.0.0.1",
  () =>
    console.log(
      `Camar Sports: http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 4173}`,
    ),
);
process.on("SIGINT", () => {
  api.close();
  server.close();
});
