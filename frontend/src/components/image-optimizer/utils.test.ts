import { describe, expect, it } from 'vitest';
import { DEFAULT_BATCH_SETTINGS } from './presets';
import { BatchSettings, ImageItem } from './types';
import { arrayBufferToBase64, buildDownloadNameMap, buildExportNameMap, buildZipFilename, previewFilenames, resolveExportFilename, reorderImageItems } from './utils';

function makeItem(id: string, originalName: string): ImageItem {
  return {
    id,
    originalName,
    sourceFile: new File(['x'], originalName, { type: 'image/jpeg' }),
    preview: '',
    originalSize: 1024,
    status: 'pending',
    stale: false,
    selected: false,
    excluded: false,
    overrides: {
      customFilename: '',
      customCropOffset: undefined,
      excluded: false,
      skipCompression: false,
      presetId: null,
    },
  };
}

const renameSettings: BatchSettings = {
  ...DEFAULT_BATCH_SETTINGS,
  operations: {
    ...DEFAULT_BATCH_SETTINGS.operations,
    renameEnabled: true,
  },
  rename: {
    prefix: 'foto',
    startAt: 1,
  },
};

describe('image optimizer queue order', () => {
  it('moves an image before the drop target without mutating the existing queue', () => {
    const items = [
      makeItem('first', 'a.jpg'),
      makeItem('second', 'b.jpg'),
      makeItem('third', 'c.jpg'),
    ];

    const reordered = reorderImageItems(items, 'third', 'first');

    expect(reordered.map((item) => item.id)).toEqual(['third', 'first', 'second']);
    expect(items.map((item) => item.id)).toEqual(['first', 'second', 'third']);
  });

  it('keeps before-target semantics when dragging an earlier image downward', () => {
    const items = [
      makeItem('first', 'a.jpg'),
      makeItem('second', 'b.jpg'),
      makeItem('third', 'c.jpg'),
    ];

    const reordered = reorderImageItems(items, 'first', 'third');

    expect(reordered.map((item) => item.id)).toEqual(['second', 'first', 'third']);
  });

  it('uses the reordered queue to assign sequential filenames', () => {
    const items = [
      makeItem('first', 'a.jpg'),
      makeItem('second', 'b.jpg'),
      makeItem('third', 'c.jpg'),
    ];

    const reordered = reorderImageItems(items, 'third', 'first');
    const names = buildDownloadNameMap(reordered, renameSettings);

    expect(names.get('third')).toBe('foto_001.jpg');
    expect(names.get('first')).toBe('foto_002.jpg');
    expect(names.get('second')).toBe('foto_003.jpg');
  });
});

describe('image optimizer export naming', () => {
  it('preserves queue indices when resolving names for a download subset', () => {
    const items = [
      makeItem('first', 'a.jpg'),
      makeItem('second', 'b.jpg'),
      makeItem('third', 'c.jpg'),
    ];
    const fullMap = buildExportNameMap(items, renameSettings);
    const subsetMap = buildDownloadNameMap([items[0], items[2]], renameSettings);

    expect(fullMap.get('first')).toBe('foto_001.jpg');
    expect(fullMap.get('third')).toBe('foto_003.jpg');
    expect(subsetMap.get('third')).toBe('foto_002.jpg');
    expect(resolveExportFilename('third', items, renameSettings)).toBe('foto_003.jpg');
  });

  it('previewFilenames shows sequential names when rename is enabled', () => {
    const names = previewFilenames(renameSettings, 0);
    expect(names[0]).toBe('foto_001.jpg');
    expect(names[1]).toBe('foto_002.jpg');
    expect(names[2]).toBe('foto_003.jpg');
  });
});

describe('image optimizer zip export', () => {
  it('keeps a single zip extension when the user includes it', () => {
    const settings: BatchSettings = {
      ...DEFAULT_BATCH_SETTINGS,
      export: {
        mode: 'zip',
        zipName: 'fotos_cliente.zip',
        outputFolder: '',
      },
    };

    expect(buildZipFilename(settings)).toBe('fotos_cliente.zip');
  });

  it('keeps the backend-compatible zip filename sanitization', () => {
    const settings: BatchSettings = {
      ...DEFAULT_BATCH_SETTINGS,
      export: {
        mode: 'zip',
        zipName: 'imagenes optimizadas cliente.zip',
        outputFolder: '',
      },
    };

    expect(buildZipFilename(settings)).toBe('imagenes_optimizadas_cliente.zip');
  });
});

describe('arrayBufferToBase64', () => {
  it('encodes an empty buffer to an empty string', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('encodes a small buffer identically to btoa', () => {
    const text = 'Antares optimizador';
    const buffer = new TextEncoder().encode(text).buffer;
    expect(arrayBufferToBase64(buffer)).toBe(btoa(text));
  });

  it('encodes a buffer larger than the chunk size without stack overflow', () => {
    // 0x8000 (32 KB) is the chunk boundary inside arrayBufferToBase64 —
    // a buffer bigger than that exercises the loop path that previously
    // crashed when spreading the whole Uint8Array into String.fromCharCode.
    const bytes = new Uint8Array(0x10000);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = i & 0xff;
    }
    const encoded = arrayBufferToBase64(bytes.buffer);
    // Decode back and compare — confirms no data was dropped between chunks.
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.every((value, index) => value === bytes[index])).toBe(true);
  });
});
