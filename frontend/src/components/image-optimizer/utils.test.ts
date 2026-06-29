import { describe, it, expect } from 'vitest';
import { chunkFilesForIpc, type OptimizerFile } from './utils';

const file = (filename: string, kb: number): OptimizerFile => ({
  filename,
  // 1 KB of base64 = 1024 chars
  content_b64: 'A'.repeat(kb * 1024),
});

describe('chunkFilesForIpc', () => {
  it('devuelve un único chunk cuando el batch cabe en el límite', () => {
    const files = [file('a.jpg', 100), file('b.jpg', 200)];
    const chunks = chunkFilesForIpc(files);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it('parte por tamaño base64: ningún chunk excede maxBytesPerChunk', () => {
    // 3 archivos de 20MB base64 cada uno, cap 32MB → [20],[20],[20]
    const files = [file('1.jpg', 20 * 1024), file('2.jpg', 20 * 1024), file('3.jpg', 20 * 1024)];
    const chunks = chunkFilesForIpc(files, 32 * 1024 * 1024, 500);
    expect(chunks).toHaveLength(3);
    for (const c of chunks) {
      const bytes = c.reduce((acc, f) => acc + f.content_b64.length, 0);
      expect(bytes).toBeLessThanOrEqual(32 * 1024 * 1024);
    }
  });

  it('agrupa archivos pequeños hasta justo por debajo del cap de bytes', () => {
    // 4 archivos de 10MB, cap 32MB → [10,10,10] excedería? 10+10+10=30 ok, +10=40>32
    // => [10,10,10],[10]
    const files = [file('a', 10 * 1024), file('b', 10 * 1024), file('c', 10 * 1024), file('d', 10 * 1024)];
    const chunks = chunkFilesForIpc(files, 32 * 1024 * 1024, 500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(3);
    expect(chunks[1]).toHaveLength(1);
  });

  it('parte por conteo: ningún chunk excede maxFilesPerChunk (archivos diminutos)', () => {
    const files = Array.from({ length: 1200 }, (_, i) => file(`${i}.jpg`, 1));
    const chunks = chunkFilesForIpc(files, 32 * 1024 * 1024, 500);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[1]).toHaveLength(500);
    expect(chunks[2]).toHaveLength(200);
  });

  it('preserva el orden y la totalidad de archivos a través de los chunks', () => {
    const files = Array.from({ length: 100 }, (_, i) => file(`${i}.jpg`, 600)); // 600KB c/u
    const chunks = chunkFilesForIpc(files, 32 * 1024 * 1024, 500);
    const flat = chunks.flat();
    expect(flat).toHaveLength(100);
    expect(flat.map((f) => f.filename)).toEqual(files.map((f) => f.filename));
  });

  it('entrada vacía → sin chunks', () => {
    expect(chunkFilesForIpc([])).toEqual([]);
  });

  it('un solo archivo que excede el cap va en su propio chunk (no se pierde)', () => {
    const files = [file('huge.jpg', 60 * 1024)];
    const chunks = chunkFilesForIpc(files, 32 * 1024 * 1024, 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(1);
  });
});
