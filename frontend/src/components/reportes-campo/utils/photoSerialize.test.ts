import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getReportConfig } from '../constants';
import { createEmptyPanel } from '../hooks/useCampoPanels';
import {
    panelToStored,
    photoFileToStored,
    storedToPanel,
    storedToPhotoFile,
} from './storage';
import type { PhotoFile } from '../types';

describe('photoFileToStored / storedToPhotoFile', () => {
    beforeEach(() => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn((blob: Blob) => `blob:${(blob as { name?: string }).name ?? 'x'}`),
            revokeObjectURL: vi.fn(),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('round-trips a photo keeping id, name and type', () => {
        const file = new File(['bytes'], 'foto.jpg', { type: 'image/jpeg' });
        const photo: PhotoFile = {
            id: 'p1',
            file,
            previewUrl: 'blob:original',
        };

        const stored = photoFileToStored(photo);
        expect(stored.id).toBe('p1');
        expect(stored.name).toBe('foto.jpg');
        expect(stored.type).toBe('image/jpeg');
        expect(stored.blob).toBeInstanceOf(Blob);

        const restored = storedToPhotoFile(stored);
        expect(restored.id).toBe('p1');
        expect(restored.file.name).toBe('foto.jpg');
        expect(restored.file.type).toBe('image/jpeg');
        expect(restored.previewUrl).toBe('blob:foto.jpg');
    });
});

describe('panelToStored / storedToPanel', () => {
    beforeEach(() => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:mock'),
            revokeObjectURL: vi.fn(),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('round-trips a panel with photos and header', () => {
        const config = getReportConfig('panel-fotografico');
        const panel = createEmptyPanel(config);
        panel.header.CENTRO = 'CS Norte';
        panel.photos = [
            { id: 'p1', file: new File(['a'], '1.jpg', { type: 'image/jpeg' }), previewUrl: 'blob:1' },
            { id: 'p2', file: new File(['b'], '2.png', { type: 'image/png' }), previewUrl: 'blob:2' },
        ];

        const stored = panelToStored(panel, 'panel-fotografico');
        expect(stored.reportType).toBe('panel-fotografico');
        expect(stored.id).toBe(panel.id);
        expect(stored.header.CENTRO).toBe('CS Norte');
        expect(stored.photos).toHaveLength(2);
        expect(stored.photos[0].blob).toBeInstanceOf(Blob);

        const restored = storedToPanel(stored);
        expect(restored.id).toBe(panel.id);
        expect(restored.header.CENTRO).toBe('CS Norte');
        expect(restored.photos).toHaveLength(2);
        expect(restored.photos[0].file.name).toBe('1.jpg');
        expect(restored.photos[1].file.type).toBe('image/png');
        // El header restaurado es una copia, no la misma referencia.
        expect(restored.header).not.toBe(stored.header);
    });
});
