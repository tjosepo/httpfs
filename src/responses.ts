export class OkResponse extends Response {
  constructor(message = "200 OK") {
    super(message, {
      status: 200,
      statusText: "OK",
      headers: new Headers({
        "Content-Length": message.length.toString(),
      }),
    });
  }
}

export class BadRequestResponse extends Response {
  constructor(message = "400 Bad Request") {
    super(message, {
      status: 400,
      statusText: "Bad Request",
      headers: new Headers({
        "Content-Length": message.length.toString(),
      }),
    });
  }
}

export class NotFoundResponse extends Response {
  constructor(message = "404 Not Found") {
    super(message, {
      status: 404,
      statusText: "Not Found",
      headers: new Headers({
        "Content-Length": message.length.toString(),
      }),
    });
  }
}

export class InternalServerErrorResponse extends Response {
  constructor(message = "500 Internal Server Error") {
    super(message, {
      status: 500,
      statusText: "500 Internal Server Error",
      headers: new Headers({
        "Content-Length": message.length.toString(),
      }),
    });
  }
}
