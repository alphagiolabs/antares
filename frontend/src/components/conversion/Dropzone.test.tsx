import { render, screen } from '@testing-library/react';
import Dropzone from './Dropzone';

describe('Dropzone loaded state', () => {
  it('renders secondary actions, center controls, and conversion action in one row', () => {
    render(
      <Dropzone
        dragOver={false}
        onAddFiles={() => {}}
        onAddFolderPaths={() => {}}
        onClear={() => {}}
        fileCount={4}
        centerControls={<button>Configuracion</button>}
        conversionAction={<button>Iniciar renombrado</button>}
      />,
    );

    const row = screen.getByTestId('dropzone-loaded-row');
    expect(row).toContainElement(screen.getByTestId('dropzone-secondary-actions'));
    expect(row).toContainElement(screen.getByText('Configuracion'));
    expect(row).toContainElement(screen.getByText('Iniciar renombrado'));
    expect(screen.queryByText('4 imagenes')).not.toBeInTheDocument();
    expect(screen.queryByText('Listo para convertir')).not.toBeInTheDocument();

    expect(screen.queryByText('Base de datos')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cargar mapeo/)).not.toBeInTheDocument();
  });
});
