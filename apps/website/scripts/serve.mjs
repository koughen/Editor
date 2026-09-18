import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { outputDirectory } from "./build.mjs";

const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".webp": "image/webp", ".json": "application/json",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    // Local-only viewport frames for manual browser checks; these are never built or deployed.
    if (["/__preview/mobile", "/__preview/tablet"].includes(url.pathname)) {
      const width = url.pathname.endsWith("mobile") ? 390 : 768;
      const requestedPage = url.searchParams.get('page') || '';
      const previewPage = /^[a-z0-9/-]*$/.test(requestedPage) ? requestedPage : '';
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html lang="en"><title>Editor ${width}px preview</title><style>body{margin:0;background:#333;display:grid;justify-items:center}iframe{border:0;width:${width}px;height:calc(100vh - 32px);margin:16px 0;background:#0b0b0b}</style><iframe title="Editor ${width}px website preview" src="/Editor/${previewPage}"></iframe></html>`);
      return;
    }
    const decodedPath = decodeURIComponent(url.pathname).replace(/^\/Editor(?:\/|$)/, "/");
    const filePath = resolve(outputDirectory, `.${decodedPath.endsWith("/") ? `${decodedPath}index.html` : decodedPath}`);
    if (!filePath.startsWith(`${outputDirectory}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 400, { "Content-Type": "text/plain" });
    response.end(error.code === "ENOENT" ? "Not found" : "Bad request");
  }
}).listen(port, "127.0.0.1", () => console.log(`Editor website: http://127.0.0.1:${port}/Editor/`));
