import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Hoisted mocks — must be defined before the vi.mock call.
const mockApi = vi.hoisted(() => ({
  dialogFolder: vi.fn().mockResolvedValue({ paths: [], folder: '' }),
  imageOptimizerSaveFiles: vi.fn(),
}));

const mockPipeline = vi.hoisted(() => ({
  // Synchronous-friendly stub: skip the real loadImageDimensions which
  // jsdom can't fulfill (no real image decoding).
  createImageItem: vi.fn(async (file: File) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sourceFile: file,
    preview: 'blob:stub',
    originalName: file.name,
    originalSize: file.size,
    sourceWidth: 100,
    sourceHeight: 100,
    status: 'pending' as const,
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
  })),
  processImageItem: vi.fn(async () => {
    throw new Error('processImageItem not used in this test suite');
  }),
}));

vi.mock('../../api', () => ({ api: mockApi }));
vi.mock('../../utils/history', () => ({ saveFeatureHistory: vi.fn() }));
vi.mock('./pipeline', () => ({
  createImageItem: mockPipeline.createImageItem,
  processImageItem: mockPipeline.processImageItem,
}));

import ImageOptimizer from './index';
import { ImageItem } from './types';

// jsdom does not implement ResizeObserver — stub it so the optimizer mounts.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

function makeDownloadableItem(id: string, originalName: string): ImageItem {
  const blob = new Blob(['pixel-data'], { type: 'image/jpeg' });
  const file = new File([blob], originalName, { type: 'image/jpeg' });
  return {
    id,
    originalName,
    sourceFile: file,
    preview: '',
    originalSize: blob.size,
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

// jsdom does not implement DataTransfer, so we synthesize a FileList by
// attaching files to the hidden <input type="file"> via Object.defineProperty
// and firing the change event — the same path the user takes when picking
// files from the native dialog.
async function mountAndAddFiles(items: ImageItem[]): Promise<void> {
  render(<ImageOptimizer />);

  // Activate the "Solo renombrar" preset so added images are direct-export
  // (no crop/resize/format/compression) and therefore immediately
  // downloadable without processing. This is the cleanest way to reach the
  // download menu state in jsdom, where canvas-based processing can't run.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Solo renombrar/i }));
  });

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();

  const files = items.map((item) => item.sourceFile);
  Object.defineProperty(input, 'files', {
    value: files,
    writable: false,
    configurable: true,
  });

  await act(async () => {
    fireEvent.change(input);
  });

  // Wait for createImageItem (async) to populate state and the toast to fire.
  await waitFor(() => {
    expect(screen.queryByText(/agregada|agregado/i)).toBeTruthy();
  });
}

describe('ImageOptimizer download menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.dialogFolder.mockResolvedValue({ paths: [], folder: '' });
    mockApi.imageOptimizerSaveFiles.mockResolvedValue({
      saved_path: '/tmp/out',
      saved_count: 0,
      skipped_count: 0,
      saved: [],
      skipped: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the download chevron with a single downloadable image', async () => {
    // Default preset = direct-export, so a single added image is immediately
    // downloadable without processing. The chevron must be present so the
    // user can reach "Guardar en carpeta..." even with one file.
    await mountAndAddFiles([makeDownloadableItem('a', 'foto.jpg')]);
    expect(screen.getByLabelText('Opciones de descarga')).toBeInTheDocument();
  });

  it('reveals "Guardar en carpeta..." option when the chevron is clicked', async () => {
    await mountAndAddFiles([makeDownloadableItem('a', 'foto.jpg')]);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Opciones de descarga'));
    });

    expect(screen.getByRole('menuitem', { name: /Guardar en carpeta/i })).toBeInTheDocument();
    // The ZIP option is intentionally hidden with a single file.
    expect(screen.queryByRole('menuitem', { name: /Descargar como ZIP/i })).not.toBeInTheDocument();
  });

  it('shows all three download options with multiple downloadable images', async () => {
    await mountAndAddFiles([
      makeDownloadableItem('a', 'foto1.jpg'),
      makeDownloadableItem('b', 'foto2.jpg'),
    ]);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Opciones de descarga'));
    });

    expect(screen.getByRole('menuitem', { name: /Descargar como ZIP/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Descargar individual/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Guardar en carpeta/i })).toBeInTheDocument();
  });

  it('invokes the save-to-folder backend flow when "Guardar en carpeta" is clicked', async () => {
    const folder = 'C:\\Users\\test\\out';
    mockApi.dialogFolder.mockResolvedValue({ paths: [], folder });
    mockApi.imageOptimizerSaveFiles.mockResolvedValue({
      saved_path: folder,
      saved_count: 1,
      skipped_count: 0,
      saved: [{ filename: 'foto.jpg', path: `${folder}\\foto.jpg` }],
      skipped: [],
    });

    await mountAndAddFiles([makeDownloadableItem('a', 'foto.jpg')]);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Opciones de descarga'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Guardar en carpeta/i }));
    });

    await waitFor(() => {
      expect(mockApi.dialogFolder).toHaveBeenCalledWith(
        expect.objectContaining({ pickOnly: true }),
      );
    });
    await waitFor(() => {
      expect(mockApi.imageOptimizerSaveFiles).toHaveBeenCalledWith(
        expect.objectContaining({ output_folder: folder }),
      );
    });
  });
});
