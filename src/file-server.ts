import * as Http from "./server.ts";
import { textPlain, textHtml } from "./content-types.ts";
import { readableStreamFromReader, delay } from "./deps.ts";
import { lookup } from "https://deno.land/x/media_types/mod.ts";

export interface FileServerOptions {
  port?: number;
  directory?: string;
  verbose?: boolean;
}

export class FileServer {
  #port: number;
  #directory: string;
  #verbose: boolean;
  #readLock: string[] = [];
  #writeLock: string[] = [];

  constructor(options: FileServerOptions = {}) {
    this.#port = options.port ?? 8080;
    this.#directory = options.directory ?? ".";
    this.#verbose = options.verbose ?? false;
  }

  async listen() {
    const port = this.#port;

    if (this.#verbose) console.log(`Listening on http://localhost:${port}/`);

    for await (const { request, reply } of Http.listen({ port })) {
      (async () => {
        try {
          const { pathname } = new URL(request.url);
          const start = Date.now();
          let response: Response | undefined = undefined;

          if (this.#verbose) {
            console.log(`Received ${request.method} ${pathname}`);
          }

          try {
            if (request.method === "GET") {
              const release = await this.#getReadPermission(pathname);
              try {
                response = await this.#getFile(request);
                await reply(response);
                release();
              } catch (e) {
                release();
              }
            }

            if (request.method === "POST") {
              const release = await this.#getWritePermission(pathname);
              try {
                response = await this.#writeFile(request);
                await reply(response);
                release();
              } catch (e) {
                release();
              }
            }
          } catch (e) {
            console.error(e);
            response = new Response("500 Unhandled exception", {
              status: 500,
            });
            await reply(response);
          }

          if (!response) {
            response = new Response("500 Unhandled exception", {
              status: 500,
            });
            await reply(response);
          }

          const ms = Date.now() - start;
          if (this.#verbose) {
            const { pathname } = new URL(request.url);
            console.log(
              `Completed ${request.method} ${pathname} ${response.status} ${ms}ms`
            );
          }
        } catch {
          // Drop it
        }
      })();
    }
  }

  async #getFile(request: Request) {
    const { pathname } = new URL(request.url);

    try {
      const file = await Deno.open(this.#directory + pathname, { read: true });
      const stream = readableStreamFromReader(file);

      const stat = await file.stat();
      const headers = new Headers();
      headers.append("Content-Length", `${stat.size}`);

      const type = lookup(pathname);
      if (type) headers.append("Content-Type", type);

      switch (type) {
        case "text/plain":
        case "image/jpeg":
        case "image/gif":
        case "image/png":
          headers.append("Content-Disposition", "inline");
          break;
        default:
          headers.append("Content-Disposition", "attachment");
          break;
      }

      return new Response(stream, { headers });
    } catch {
      // File doesn't exist
    }

    try {
      const entries = Deno.readDir(this.#directory + pathname);
      let directories = [];
      let files = [];
      for await (const { name, isDirectory, isFile } of entries) {
        if (isDirectory) directories.push(name + "/");
        if (isFile) files.push(name);
      }
      directories = directories.sort();
      files = files.sort();

      const accept = request.headers.get("Accept")?.split(",")[0];

      let result: string;
      const headers = new Headers();

      if (accept === "text/html") {
        headers.set("Content-Type", "text/html");
        result = textHtml({ pathname, directories, files });
      } else {
        headers.set("Content-Type", "text/plain");
        result = textPlain({ pathname, directories, files });
      }

      headers.set("Content-Length", `${result.length}`);

      return new Response(result, { headers });
    } catch {
      // Directory doesn't exist
    }

    return new Response("404 Not found", {
      status: 404,
    });
  }

  async #writeFile(request: Request) {
    const { pathname } = new URL(request.url);
    const { body } = request;

    if (!body) {
      // Basic 200 OK
      return new Response();
    }

    const reader = body.getReader();
    const file = await Deno.open(this.#directory + pathname, {
      create: true,
      write: true,
    });

    while (true) {
      const { value, done } = await reader.read();
      if (value) await file.write(value);
      if (done) break;
    }

    file.close();

    const result = `Created file ${pathname}`;
    const headers = new Headers();
    headers.set("Content-Length", `${result.length}`);

    return new Response(result, { headers });
  }

  async #getWritePermission(filename: string) {
    while (true) {
      if (this.#writeLock.includes(filename)) await delay(0);
      else {
        this.#readLock.push(filename);
        this.#writeLock.push(filename);
        return () => {
          this.#writeLock = this.#writeLock.filter(
            (locks) => locks !== filename
          );
          this.#readLock = this.#readLock.filter((locks) => locks !== filename);
        };
      }
    }
  }

  async #getReadPermission(filename: string) {
    while (true) {
      if (this.#readLock.includes(filename)) await delay(0);
      else {
        // Pushes one instance of filename for each reader
        this.#writeLock.push(filename);

        return () => {
          // Removes a single instance of 'filename'
          for (let i = 0; i < this.#writeLock.length; i++) {
            if (filename === this.#writeLock[i]) {
              delete this.#writeLock[i];
              break;
            }
          }

          // Clean up array
          this.#writeLock = this.#writeLock.filter(Boolean);
        };
      }
    }
  }
}
