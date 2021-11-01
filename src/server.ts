import { indexOf } from "./deps.ts";
import Header from "./header.ts";

interface ServerOptions {
  port?: number;
}

export async function* listen(options: ServerOptions = {}) {
  const { port = 8080 } = options;
  const listener = Deno.listen({ port, transport: "tcp" });

  while (true) {
    try {
      const conn = await listener.accept();
      const request = await getRequest(conn);
      const reply = getReply(conn);
      yield { request, reply };
    } catch (e) {
      console.error(e);
    }
  }
}

async function getRequest(conn: Deno.Conn): Promise<Request> {
  const CRLF = new Uint8Array([13, 10]);
  const bufferSize = 16 * 1024;
  const decoder = new TextDecoder();
  const bytes = new Uint8Array(bufferSize);
  const numberOfBytesRead = await conn.read(bytes);

  let method = "";
  let path = "";
  const headers = new Headers();

  if (numberOfBytesRead === null) {
    throw "Request cannot be empty.";
  }

  let index = 0;
  let reachedCRLF = false;
  while (!reachedCRLF) {
    const lineEnd = indexOf(bytes, CRLF, index);
    const line = decoder.decode(bytes.subarray(index, lineEnd));

    if (index === 0) {
      // Request Line
      [method, path] = line.split(" ");
    } else if (line) {
      // Header Line
      const [key, value] = Header.parseLine(line);
      headers.append(key, value);
    } else {
      reachedCRLF = true;
    }

    index = lineEnd + 2;
  }

  const contentLength = Number(headers.get("content-length") ?? 0);
  let contentBytesRead = 0;

  let body: ReadableStream<Uint8Array> | undefined = undefined;

  if (method === "POST") {
    body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (contentLength) {
          const chunk = bytes.subarray(index, numberOfBytesRead);
          contentBytesRead += chunk.length;
          controller.enqueue(chunk);
          if (contentBytesRead >= contentLength) controller.close();
        }
      },
      async pull(controller) {
        const bytes = new Uint8Array(bufferSize);
        const numberOfBytesRead = await conn.read(bytes);
        if (!numberOfBytesRead) {
          controller.close();
        } else {
          const chunk = bytes.subarray(0, numberOfBytesRead);
          contentBytesRead += bytes.length;
          controller.enqueue(chunk);
          if (contentBytesRead >= contentLength) controller.close();
        }
      },
    });
  }

  return new Request(`http://localhost${path}`, {
    body,
    method,
    headers,
  });
}

function getReply(conn: Deno.Conn) {
  async function reply(resource: Response): Promise<void>;
  async function reply(resource: BodyInit, init?: ResponseInit): Promise<void>;
  async function reply(
    resource: Response | BodyInit,
    init?: ResponseInit
  ): Promise<void> {
    if (!(resource instanceof Response))
      return reply(new Response(resource, init));

    let message = `HTTP/1.1 ${resource.status} ${resource.statusText}\r\n`;
    message += Header.stringify(resource.headers);
    message += "\r\n";

    const encoder = new TextEncoder();
    conn.write(encoder.encode(message));

    if (resource.body) {
      const reader = resource.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (value) await conn.write(value);
        if (done) break;
      }
    }

    conn.close();
  }

  return reply;
}
