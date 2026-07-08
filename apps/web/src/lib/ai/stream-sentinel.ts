/**
 * Framing delimiter for the thinking+JSON stream (streamThinkingJson). The server streams visible
 * reasoning as plain text, then this sentinel, then one JSON line (the reconciled result). Kept in
 * a dependency-free leaf so BOTH the server AI core and the browser client import the exact same
 * string — no duplication, no server code pulled into the client bundle.
 *
 * The server ALWAYS appends this delimiter last, immediately before the JSON payload, so the client
 * splits on its LAST occurrence: the JSON payload never contains the token, so lastIndexOf lands on
 * the real boundary even in the vanishingly unlikely case the reasoning text echoed the token.
 */
export const STREAM_JSON_SENTINEL = "␞__KEEPSAKE_ETIOLOGY_JSON__␞";
