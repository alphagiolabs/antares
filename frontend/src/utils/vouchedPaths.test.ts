import { describe, expect, it } from 'vitest';
import { clearVouchedPaths, isVouchedPath, markVouchedPaths } from './vouchedPaths';

describe('vouchedPaths tracker (SEC-003/004 Capa 2 frontend mirror)', () => {
    it('starts empty', () => {
        clearVouchedPaths();
        expect(isVouchedPath('C:\\tmp\\foto.jpg')).toBe(false);
        expect(isVouchedPath(undefined)).toBe(false);
        expect(isVouchedPath('')).toBe(false);
    });

    it('marks and matches vouched paths', () => {
        clearVouchedPaths();
        markVouchedPaths(['C:\\tmp\\foto.jpg', 'C:/photos']);
        expect(isVouchedPath('C:\\tmp\\foto.jpg')).toBe(true);
        expect(isVouchedPath('C:/photos')).toBe(true);
        expect(isVouchedPath('C:\\tmp\\other.jpg')).toBe(false);
    });

    it('matches case-insensitively (Windows canonicalization parity)', () => {
        clearVouchedPaths();
        markVouchedPaths(['C:\\TMP\\Foto.JPG']);
        expect(isVouchedPath('c:\\tmp\\foto.jpg')).toBe(true);
    });

    it('ignores non-array / empty entries', () => {
        clearVouchedPaths();
        markVouchedPaths(null as unknown as string[]);
        markVouchedPaths(['', '  ', 'C:/ok.png']);
        expect(isVouchedPath('C:/ok.png')).toBe(true);
        expect(isVouchedPath('')).toBe(false);
    });

    it('clearVouchedPaths resets the set', () => {
        markVouchedPaths(['C:/a.jpg']);
        clearVouchedPaths();
        expect(isVouchedPath('C:/a.jpg')).toBe(false);
    });
});
