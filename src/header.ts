/**
 * Converts a HTTP header string into an object.
 * @param text A valid HTTP header.
 */
function parse(text: string) {
  const headers: Record<string, string> = {};

  const lines = text.split("\r\n");
  for (const line of lines) {
    if (!line) continue;
    const [name, ...value] = line.split(":");
    headers[name.trim()] = value.join(":").trimStart();
  }

  return headers;
}

/**
 * Converts a HTTP header string into an object.
 * @param text A valid HTTP header.
 */
function parseLine(text: string) {
  const [name, ...value] = text.trim().split(":");
  return [name.trim().toLowerCase(), value.join(":").trimStart()];
}

/**
 * Converts a JavaScript object to a HTTP header string.
 * @param text A JavaScript object.
 */
function stringify(headers: Headers | Record<string, string>): string {
  const lines = [];
  let entries: Iterable<[string, string]>;

  if (headers instanceof Headers) {
    entries = headers.entries();
  } else {
    entries = Object.entries(headers);
  }

  for (const entry of entries) {
    const [fieldName, value] = entry;
    const header = `${fieldName}: ${value}`;
    lines.push(header);
  }

  return lines.join("\r\n") + "\r\n";
}

export default {
  parse,
  parseLine,
  stringify,
};
