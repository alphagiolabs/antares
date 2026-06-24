import { describe, expect, it } from 'vitest';
import { getPhotoGridLayout } from './photoGridLayout';

describe('getPhotoGridLayout', () => {
    it('uses empty 3x2 placeholders when there are no images', () => {
        const layout = getPhotoGridLayout(0);
        expect(layout.columns).toBe(3);
        expect(layout.rows).toEqual([
            [null, null, null],
            [null, null, null],
        ]);
        expect(layout.imageSizing).toBe('fill');
    });

    it('centers a single image in a 2-column grid', () => {
        expect(getPhotoGridLayout(1)).toEqual({
            columns: 2,
            rows: [[0]],
            imageSizing: 'aspectPreserve',
        });
    });

    it('uses 2 columns for two images on one row', () => {
        expect(getPhotoGridLayout(2)).toEqual({
            columns: 2,
            rows: [[0, 1]],
            imageSizing: 'aspectPreserve',
        });
    });

    it('uses 2+1 layout for three images', () => {
        expect(getPhotoGridLayout(3)).toEqual({
            columns: 2,
            rows: [[0, 1], [2]],
            imageSizing: 'aspectPreserve',
        });
    });

    it('uses 2x2 layout for four images', () => {
        expect(getPhotoGridLayout(4)).toEqual({
            columns: 2,
            rows: [[0, 1], [2, 3]],
            imageSizing: 'aspectPreserve',
        });
    });

    it('uses 3+2 layout for five images', () => {
        const layout = getPhotoGridLayout(5);
        expect(layout.columns).toBe(3);
        expect(layout.rows[0]).toEqual([0, 1, 2]);
        expect(layout.rows[1]).toEqual([3, 4]);
        expect(layout.imageSizing).toBe('fill');
    });

    it('uses full 3x2 layout for six images', () => {
        expect(getPhotoGridLayout(6)).toEqual({
            columns: 3,
            rows: [[0, 1, 2], [3, 4, 5]],
            imageSizing: 'fill',
        });
    });

    it('clamps counts above six to the six-image layout', () => {
        expect(getPhotoGridLayout(12)).toEqual(getPhotoGridLayout(6));
    });
});
