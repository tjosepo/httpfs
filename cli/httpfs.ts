import { parse } from "https://deno.land/std@0.110.0/flags/mod.ts";
import { FileServer } from "../mod.ts";

const params = parse(Deno.args, {
  boolean: ["v", "h"],
  string: ["p", "d"],
});

const help =
  "httpfs is a simple file server.\n" +
  "usage: httpfs [-v] [  -p PORT] [-d PATH-TO-DIR]\n" +
  "    -v    Prints debugging messages.\n" +
  "    -p    Specifies the port number that the server will listen and serve at.\n" +
  "          Default is 8080.\n" +
  "    -d    Specifies the directory that the server will use to read/write requested files. Default is the current directory when launching the application.";

if (params["h"]) {
  console.log(help);
} else {
  new FileServer({
    port: params["p"] ? Number(params["p"]) : undefined,
    directory: params["d"],
    verbose: params["v"],
  }).listen();
}
