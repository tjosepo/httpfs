import * as Http from "./server.ts";
import {
  OkResponse,
  BadRequestResponse,
  NotFoundResponse,
  InternalServerErrorResponse,
} from "./responses.ts";
import { textPlain, applicationJson, textHtml } from "./content-types.ts";
import { readableStreamFromReader, delay, ensureDir } from "./deps.ts";
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

    console.log(`Listening on http://localhost:${port}/`);

    for await (const { request, reply } of Http.listen({ port })) {
      (async () => {
        const { pathname } = new URL(request.url);
        const start = Date.now();
        let response: Response | undefined = undefined;

        if (this.#verbose) {
          console.log(`Received ${request.method} ${pathname}`);
        }

        if (request.method === "GET") {
          const release = await this.#getReadPermission(pathname);
          response = await this.#getFile(request);
          await reply(response);
          release();
        }

        if (request.method === "POST") {
          const release = await this.#getWritePermission(pathname);
          response = await this.#writeFile(request);
          await reply(response);
          release();
        }

        if (!response) {
          response = new InternalServerErrorResponse();
          await reply(response);
        }

        const ms = Date.now() - start;
        if (this.#verbose) {
          const { pathname } = new URL(request.url);
          console.log(
            `Completed ${request.method} ${pathname} ${
              response!.status
            } ${ms}ms`
          );
        }
      })();
    }
  }

  async #getFile(request: Request) {
    const { pathname } = new URL(request.url);
    const filename = decodeURI(pathname);

    try {
      const file = await Deno.open(this.#directory + filename, {
        read: true,
      });
      const stream = readableStreamFromReader(file);

      const stat = await file.stat();
      const headers = new Headers();
      headers.append("Content-Length", `${stat.size}`);

      const type = lookup(pathname);
      if (type) headers.append("Content-Type", type);

      switch (type) {
        case "text/plain":
        case "text/markdown":
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
      const entries = Deno.readDir(this.#directory + filename);
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
      } else if (accept === "application/json") {
        headers.set("Content-Type", "application/json");
        result = applicationJson({ pathname, directories, files });
      } else {
        headers.set("Content-Type", "text/plain");
        result = textPlain({ pathname, directories, files });
      }

      headers.set("Content-Length", `${result.length}`);

      return new Response(result, { headers });
    } catch {
      // Directory doesn't exist
    }

    return new NotFoundResponse();
  }

  async #writeFile(request: Request) {
    const { pathname } = new URL(request.url);
    const { body } = request;

    const filename = decodeURI(pathname).split("/").filter(Boolean).at(-1);

    if (!filename) {
      return new BadRequestResponse();
    }

    const dir = decodeURI(pathname).substring(0, pathname.indexOf(filename));
    await ensureDir(this.#directory + dir);

    let file;
    try {
      file = await Deno.open(this.#directory + dir + filename, {
        create: true,
        write: true,
      });

      if (!body) {
        return new OkResponse(`Created file ${pathname}`);
      }

      const reader = body.getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (value) await file.write(value);
        if (done) break;
      }
    } catch (e) {
      console.error(e);
    } finally {
      file?.close();
    }

    return new OkResponse(`Created file ${pathname}`);
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
