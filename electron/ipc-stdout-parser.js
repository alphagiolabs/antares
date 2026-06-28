/**
 * perf-16: pure stdout line parser for the JSON-RPC backend protocol.
 *
 * Decodes one stdout chunk into complete '\n'-terminated lines, retaining the
 * trailing partial line in `buffer` (the caller owns `buffer` and the
 * `StringDecoder` so both persist across chunks). Uses StringDecoder so a
 * multibyte UTF-8 char split across chunk boundaries reassembles instead of
 * becoming U+FFFD, and indexOf+slice so the already-consumed prefix is never
 * re-scanned — the old `buffer.split('\n')` re-split the whole accumulated
 * buffer on every chunk (O(n²) for multi-MB base64 payloads).
 *
 * Kept electron-free (zero requires) so it unit-tests in plain Node without
 * the electron runtime.
 */

/**
 * @param {string} buffer  leftover from previous chunks (no trailing '\n')
 * @param {StringDecoder} dec  a persistent utf8 StringDecoder
 * @param {Buffer} data  one stdout chunk
 * @returns {{lines: string[], buffer: string}} complete lines + new leftover
 */
function _decodeLines(buffer, dec, data) {
  buffer += dec.write(data);
  const lines = [];
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    lines.push(buffer.slice(0, idx));
    buffer = buffer.slice(idx + 1);
  }
  return { lines, buffer };
}

module.exports = { _decodeLines };
