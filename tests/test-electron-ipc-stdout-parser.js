/**
 * perf-16: stdout line parser (StringDecoder + indexOf/slice).
 *
 * Verifies the pure `_decodeLines` helper exported from electron/ipc-router:
 *   - complete '\n'-terminated lines are split across chunks without loss/dupes;
 *     a trailing partial line is retained in `buffer` (not emitted prematurely);
 *   - a multibyte UTF-8 char split across chunk boundaries reassembles instead
 *     of degrading to U+FFFD (the old `data.toString()` per chunk corrupted it);
 *   - a large single line delivered in many small chunks yields exactly one
 *     intact line (regression guard for the old O(n²) `buffer.split('\n')` path).
 */
const { StringDecoder } = require('string_decoder');
const { _decodeLines } = require('../electron/ipc-stdout-parser');

function main() {
  let failed = false;
  function check(cond, msg) {
    if (!cond) {
      console.error('[FAIL] ' + msg);
      failed = true;
    }
  }

  // 1) lines split across chunks; trailing partial line retained in buffer.
  {
    const dec = new StringDecoder('utf8');
    let buffer = '';
    const got = [];
    for (const chunk of ['{"id":1}\n{"id":', '2}\n{"id":3}\n']) {
      const out = _decodeLines(buffer, dec, Buffer.from(chunk, 'utf8'));
      buffer = out.buffer;
      got.push(...out.lines);
    }
    check(got.length === 3, 'expected 3 complete lines, got ' + got.length);
    check(
      got[0] === '{"id":1}' && got[1] === '{"id":2}' && got[2] === '{"id":3}',
      'lines mismatch: ' + JSON.stringify(got),
    );
    check(buffer === '', 'buffer should be empty after final newline, got ' + JSON.stringify(buffer));

    const dec2 = new StringDecoder('utf8');
    const out2 = _decodeLines('', dec2, Buffer.from('abc\ndef', 'utf8'));
    check(out2.lines.length === 1 && out2.lines[0] === 'abc', 'should emit only complete line "abc"');
    check(out2.buffer === 'def', 'partial trailing "def" should be retained in buffer');
  }

  // 2) multibyte UTF-8 char split across chunks reassembles (no U+FFFD).
  //    "aé\n" = bytes [0x61, 0xC3, 0xA9, 0x0A]; split inside é (after 0xC3).
  {
    const full = Buffer.from('aé\n', 'utf8');
    const part1 = full.subarray(0, 2); // [0x61, 0xC3]
    const part2 = full.subarray(2); // [0xA9, 0x0A]
    const dec = new StringDecoder('utf8');
    let buffer = '';
    const got = [];
    for (const c of [part1, part2]) {
      const out = _decodeLines(buffer, dec, c);
      buffer = out.buffer;
      got.push(...out.lines);
    }
    check(got.length === 1, 'expected 1 line from reassembled multibyte, got ' + got.length);
    check(got[0] === 'aé', 'multibyte char should reassemble to "aé", got ' + JSON.stringify(got[0]));
  }

  // 3) large single line delivered in many small chunks: exactly one intact line.
  {
    const N = 50000;
    const fullBuf = Buffer.from('X'.repeat(N) + '\n', 'utf8');
    const dec = new StringDecoder('utf8');
    let buffer = '';
    const got = [];
    for (let i = 0; i < fullBuf.length; i += 1000) {
      const out = _decodeLines(buffer, dec, fullBuf.subarray(i, i + 1000));
      buffer = out.buffer;
      got.push(...out.lines);
    }
    check(got.length === 1, 'expected exactly 1 line for chunked large payload, got ' + got.length);
    check(got[0].length === N, 'line length should be ' + N + ', got ' + got[0].length);
    check(got[0] === 'X'.repeat(N), 'large line content should be intact');
  }

  if (!failed) {
    console.log('[PASS] ipc-stdout-parser: line split, multibyte reassembly, large chunked payload.');
    process.exit(0);
  }
  process.exit(1);
}

main();
