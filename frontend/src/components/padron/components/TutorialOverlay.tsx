import TutorialOverlayBase, { type TutorialStep } from "../../ui/TutorialOverlay";

const steps: TutorialStep[] = [
  {
    title: "Paso 1: Importa tu Excel",
    description:
      "Arrastra o selecciona un archivo Excel (.xlsx, .xls, .csv) con los datos del padron. Si hay varios registros, podras elegir cual editar.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    selector: ".vpad-btn-import",
  },
  {
    title: "Paso 2: Elige el formato",
    description:
      "Selecciona el formato de salida, la cantidad de items y el rango a imprimir. Tambien puedes cambiar la orientacion horizontal o vertical.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 12h18" />
      </svg>
    ),
    selector: ".vpad-section-format",
  },
  {
    title: "Paso 3: Completa los datos",
    description:
      "Rellena o corrige los campos del padron: servicio, sector, fechas y demas datos del encabezado. Los cambios se reflejan en la vista previa.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    selector: ".vpad-section-data",
  },
  {
    title: "Paso 4: Revisa la vista previa",
    description:
      "En el panel derecho puedes ver como quedara el padron paginado. Usa la navegacion si hay mas de cinco paginas en pantalla.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
    selector: ".vpad-preview-pane",
  },
  {
    title: "Paso 5: Descarga el PDF",
    description:
      "Cuando todo este correcto, haz clic en 'Descargar PDF' para generar el archivo listo para imprimir o compartir.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    selector: ".vpad-btn-download",
  },
  {
    title: "Paso 6: Imprime o reinicia",
    description:
      "Usa 'Imprimir' para enviar directamente a la impresora, o 'Limpiar' para empezar un padron nuevo desde cero.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    ),
    selector: ".vpad-action-box",
  },
];

interface TutorialOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialOverlay({ isOpen, onClose }: TutorialOverlayProps) {
  return <TutorialOverlayBase isOpen={isOpen} onClose={onClose} steps={steps} />;
}
