import { useCallback, useMemo, useState } from 'react';
import { CHUNK_SIZE, chunkArray, getDefaultHeader } from '../constants';
import type { CampoPanel, CampoPanelListItem, PhotoFile, ReportTypeConfig } from '../types';
import { derivePanelLabel } from '../utils/panelLabel';

function createPanelId(): string {
    return `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function revokePhotos(photos: PhotoFile[]) {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
}

export function createEmptyPanel(config: ReportTypeConfig): CampoPanel {
    const header = getDefaultHeader(config);
    return {
        id: createPanelId(),
        label: derivePanelLabel(header),
        header,
        photos: [],
        createdAt: Date.now(),
    };
}

export function useCampoPanels(config: ReportTypeConfig) {
    const [panels, setPanels] = useState<CampoPanel[]>(() => [createEmptyPanel(config)]);
    const [selectedPanelId, setSelectedPanelId] = useState<string | null>(() => panels[0]?.id ?? null);

    const selectedPanel = useMemo(
        () => panels.find((panel) => panel.id === selectedPanelId) ?? null,
        [panels, selectedPanelId],
    );

    const panelListItems = useMemo<CampoPanelListItem[]>(() => {
        const itemsPerPage = config.photosPerPage || CHUNK_SIZE;
        return panels.map((panel) => {
            const chunks = chunkArray(panel.photos, itemsPerPage);
            return {
                id: panel.id,
                label: panel.label,
                photoCount: panel.photos.length,
                pageCount: panel.photos.length > 0 ? chunks.length : 0,
            };
        });
    }, [panels, config]);

    const currentPanelIndex = useMemo(
        () => panels.findIndex((panel) => panel.id === selectedPanelId),
        [panels, selectedPanelId],
    );

    const resetSession = useCallback(() => {
        setPanels((prev) => {
            prev.forEach((panel) => revokePhotos(panel.photos));
            const fresh = createEmptyPanel(config);
            setSelectedPanelId(fresh.id);
            return [fresh];
        });
    }, [config]);

    const createPanel = useCallback(() => {
        const panel = createEmptyPanel(config);
        setPanels((prev) => [...prev, panel]);
        setSelectedPanelId(panel.id);
        return panel;
    }, [config]);

    const selectPanel = useCallback((id: string) => {
        setSelectedPanelId(id);
    }, []);

    const updateHeader = useCallback((key: string, value: string) => {
        if (!selectedPanelId) return;
        setPanels((prev) =>
            prev.map((panel) => {
                if (panel.id !== selectedPanelId) return panel;
                const header = { ...panel.header, [key]: value };
                return { ...panel, header, label: derivePanelLabel(header) };
            }),
        );
    }, [selectedPanelId, config]);

    const addPhotos = useCallback((files: FileList | null) => {
        if (!files || !selectedPanelId) return { added: 0, rejected: 0 };

        const maxPhotos = config.photosPerPage ?? CHUNK_SIZE;
        let added = 0;
        let rejected = 0;

        setPanels((prev) =>
            prev.map((panel) => {
                if (panel.id !== selectedPanelId) return panel;

                const remaining = maxPhotos - panel.photos.length;
                if (remaining <= 0) {
                    rejected = files.length;
                    return panel;
                }

                const accepted = Array.from(files).slice(0, remaining);
                rejected = files.length - accepted.length;
                added = accepted.length;

                const newPhotos: PhotoFile[] = accepted.map((file) => ({
                    id: `${Date.now()}-${Math.random()}`,
                    file,
                    previewUrl: URL.createObjectURL(file),
                }));

                return { ...panel, photos: [...panel.photos, ...newPhotos] };
            }),
        );

        return { added, rejected };
    }, [selectedPanelId, config]);

    const clearPhotos = useCallback(() => {
        if (!selectedPanelId) return;
        setPanels((prev) =>
            prev.map((panel) => {
                if (panel.id !== selectedPanelId) return panel;
                revokePhotos(panel.photos);
                return { ...panel, photos: [] };
            }),
        );
    }, [selectedPanelId]);

    const deletePanel = useCallback((id: string) => {
        setPanels((prev) => {
            const target = prev.find((panel) => panel.id === id);
            if (target) revokePhotos(target.photos);

            const next = prev.filter((panel) => panel.id !== id);
            if (next.length === 0) {
                const fresh = createEmptyPanel(config);
                setSelectedPanelId(fresh.id);
                return [fresh];
            }

            if (selectedPanelId === id) {
                const removedIndex = prev.findIndex((panel) => panel.id === id);
                const replacement = next[Math.min(removedIndex, next.length - 1)];
                setSelectedPanelId(replacement.id);
            }

            return next;
        });
    }, [selectedPanelId, config]);

    const duplicatePanel = useCallback((id: string) => {
        const source = panels.find((panel) => panel.id === id);
        if (!source) return;

        const maxPhotos = config.photosPerPage ?? CHUNK_SIZE;
        const clonedPhotos: PhotoFile[] = source.photos.slice(0, maxPhotos).map((photo) => ({
            id: `${Date.now()}-${Math.random()}`,
            file: photo.file,
            previewUrl: URL.createObjectURL(photo.file),
        }));

        const panel: CampoPanel = {
            id: createPanelId(),
            label: derivePanelLabel(source.header),
            header: { ...source.header },
            photos: clonedPhotos,
            createdAt: Date.now(),
        };

        setPanels((prev) => [...prev, panel]);
        setSelectedPanelId(panel.id);
    }, [panels, config]);

    const goRelativePanel = useCallback((direction: -1 | 1) => {
        const index = panels.findIndex((panel) => panel.id === selectedPanelId);
        const next = panels[index + direction];
        if (next) setSelectedPanelId(next.id);
    }, [panels, selectedPanelId]);

    return {
        panels,
        selectedPanel,
        selectedPanelId,
        panelListItems,
        currentPanelIndex,
        createPanel,
        selectPanel,
        updateHeader,
        addPhotos,
        clearPhotos,
        deletePanel,
        duplicatePanel,
        goRelativePanel,
        resetSession,
    };
}
