interface ContentTypeOptions {
  pathname: string;
  directories: string[];
  files: string[];
}

export function textPlain({ directories, files }: ContentTypeOptions) {
  return [...directories, ...files].join("\r\n");
}

export function textHtml({ pathname, directories, files }: ContentTypeOptions) {
  let body = "";

  if (directories.length) {
    body += "<p>Directories</p><ul>";
    for (const name of directories) {
      body += `<li><a href="${
        (pathname.endsWith("/") ? "" : "/") + name
      }">${name}</a></li>`;
    }
    body += "</ul>";
  }

  if (files.length) {
    body += "</ul><p>Files</p><ul>";
    for (const name of files) {
      body += `<li><a href="${
        (pathname.endsWith("/") ? "" : "/") + name
      }">${name}</a></li>`;
    }

    body += "</ul>";
  }

  return `
  <!doctype html>
  <html lang="en">
    <head></head>
    <body>
      ${body}
    </body>
  </html>`;
}
