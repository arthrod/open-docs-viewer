/**
 * The answer when an engine cannot open a document on the server.
 *
 * 422, not 500: the request was understood and the document is what failed,
 * and Val Town answers an uncaught error with its message AND its stack trace
 * in the body. Only the first line of the message is given, in plain text.
 */
export function renderFailure(engine: string, err: unknown): Response {
  const said = err instanceof Error ? err.message : String(err);
  const line = said.split("\n")[0].trim().slice(0, 300) || "no reason given";
  return new Response(`${engine} could not open this document: ${line}`, {
    status: 422,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
