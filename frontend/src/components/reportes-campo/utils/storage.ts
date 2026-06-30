import type { CampoPanel, HeaderMap, PhotoFile, ReportType, StoredPanel, StoredPhoto } from '../types';

// ─── Disponibilidad ──────────────────────────────────────────────────────────
// jsdom (tests) y navegadores sin Electron pueden no exponer IndexedDB. En ese
// caso todas las operaciones se degradan a no-op / vacío para no romper nada.

function isPersistenceAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
}

// ─── Serialización foto ↔ registro (funciones puras, testeables) ─────────────

export function photoFileToStored(photo: PhotoFile): StoredPhoto {
    return {
        id: photo.id,
        name: photo.file.name,
        type: photo.file.type,
        // File extiende Blob: se almacena directamente sin codificar a base64.
        blob: photo.file,
    };
}

export function storedToPhotoFile(stored: StoredPhoto): PhotoFile {
    const file = new File([stored.blob], stored.name, {
        type: stored.type || 'application/octet-stream',
    });
    return {
        id: stored.id,
        file,
        previewUrl: URL.createObjectURL(file),
    };
}

export function panelToStored(panel: CampoPanel, reportType: ReportType): StoredPanel {
    return {
        id: panel.id,
        reportType,
        label: panel.label,
        header: { ...panel.header },
        createdAt: panel.createdAt,
        updatedAt: Date.now(),
        photos: panel.photos.map(photoFileToStored),
    };
}

export function storedToPanel(stored: StoredPanel): CampoPanel {
    return {
        id: stored.id,
        label: stored.label,
        header: { ...stored.header } as HeaderMap,
        photos: stored.photos.map(storedToPhotoFile),
        createdAt: stored.createdAt,
    };
}

// ─── Wrapper IndexedDB ───────────────────────────────────────────────────────

const DB_NAME = 'antares_reportes_campo';
const DB_VERSION = 1;
const STORE = 'panels';
const TYPE_INDEX = 'by_type';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex(TYPE_INDEX, 'reportType', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function loadPanelsByType(reportType: ReportType): Promise<StoredPanel[]> {
    if (!isPersistenceAvailable()) return [];
    const db = await openDb();
    return new Promise<StoredPanel[]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const index = tx.objectStore(STORE).index(TYPE_INDEX);
        const request = index.getAll(IDBKeyRange.only(reportType));
        request.onsuccess = () => {
            const items = (request.result as StoredPanel[]) ?? [];
            items.sort((a, b) => a.createdAt - b.createdAt);
            resolve(items);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function savePanel(stored: StoredPanel): Promise<void> {
    if (!isPersistenceAvailable()) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(stored);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function deleteStoredPanel(id: string): Promise<void> {
    if (!isPersistenceAvailable()) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

function clearPanelsByType(reportType: ReportType): Promise<void> {
    if (!isPersistenceAvailable()) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const index = tx.objectStore(STORE).index(TYPE_INDEX);
        const request = index.openCursor(IDBKeyRange.only(reportType));
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}
