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

  if (method === "POST" && contentLength > 0) {
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
        try {
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
        } catch (e) {
          console.error(e);
          controller.close();
          conn.close();
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
  async function reply(
    body: BodyInit | Response | null | undefined,
    init?: ResponseInit | undefined
  ): Promise<void> {
    if (!(body instanceof Response)) return reply(new Response(body, init));

    try {
      let message = `HTTP/1.1 ${body.status} ${body.statusText}\r\n`;
      message += Header.stringify(body.headers);
      message += "\r\n";

      const encoder = new TextEncoder();
      conn.write(encoder.encode(message));

      if (body.body) {
        const reader = body.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (value) await conn.write(value);
          if (done) break;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      conn.close();
    }
  }

  return reply;
}
