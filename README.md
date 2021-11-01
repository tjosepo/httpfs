# httpfs
httpfs is a simple remote file manager.

## Building
To build httpc:

1. Clone this repository.
2. With [Deno](https://deno.land/), build the app by running:
```
$ deno compile --allow-net --allow-read --allow-write cli/httpfs.ts
```
or build directly without cloning:
```
$ deno compile --allow-net --allow-read --allow-write "https://github.com/tommy-josepovic/httpfs/raw/main/cli/httpfs.ts"
```

## Usage with CLI
```
usage: httpfs [-v] [  -p PORT] [-d PATH-TO-DIR]
    -v    Prints debugging messages.
    -p    Specifies the port number that the server will listen and serve at.
          Default is 8080.
    -d    Specifies the directory that the server will use to read/write requested files. Default is the current directory when launching the application.
```

## Usage with Deno
You can import ``FileServer`` in Deno:

```ts
import { FileServer } from "https://github.com/tommy-josepovic/httpfs/raw/main/mod.ts";

await new FileServer({ port: 8080, directory: "/public" }).listen();
```