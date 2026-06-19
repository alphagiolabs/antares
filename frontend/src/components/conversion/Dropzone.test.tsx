import { render, screen } from '@testing-library/react';
import Dropzone from './Dropzone';

describe('Dropzone loaded state', () => {
  it('renders summary and primary controls in the loaded row, secondary actions below', () => {
    render(
      <Dropzone
        dragOver={false}
        onAddFiles={() => {}}
        onAddFolder={() => {}}
        onClear={() => {}}
        fileCount={4}
        centerControls={<button>Configuracion</button>}
        conversionAction={<button>Iniciar renombrado</button>}
      />,
    );

    // Row 1: status summary + center controls + conversion action
    const row = screen.getByTestId('dropzone-loaded-row');
    expect(row).toContainElement(screen.getByText('4 imagenes'));
    expect(row).toContainElement(screen.getByText('Configuracion'));
    expect(row).toContainElement(screen.getByText('Iniciar renombrado'));

    // Row 2: secondary actions (separate row below the loaded row)
    expect(screen.getByTestId('dropzone-secondary-actions')).toBeInTheDocument();

    // Optional props not passed → should not render
    expect(screen.queryByText('Base de datos')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cargar mapeo/)).not.toBeInTheDocument();
  });
});
