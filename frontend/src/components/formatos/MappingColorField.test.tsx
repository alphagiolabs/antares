import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MappingColorField from './MappingColorField';

const ORIGINAL = { color_r: 0.1176, color_g: 0.2275, color_b: 0.5412 };

describe('MappingColorField', () => {
  it('renders the friendly color label and help text', () => {
    render(
      <MappingColorField
        mapping={ORIGINAL}
        originalMapping={ORIGINAL}
        showReset={false}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText('Color del número')).toBeInTheDocument();
    expect(screen.getByText(/Solo cambia el color del correlativo/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Color del número')).toHaveValue('#1e3a8a');
  });

  it('emits normalized colors when the picker changes', () => {
    const onChange = vi.fn();
    render(
      <MappingColorField
        mapping={ORIGINAL}
        originalMapping={ORIGINAL}
        showReset={false}
        onChange={onChange}
      />,
    );

    fireEvent.input(screen.getByLabelText('Color del número'), { target: { value: '#000000' } });
    expect(onChange).toHaveBeenCalledWith({ color_r: 0, color_g: 0, color_b: 0 });
  });

  it('shows reset only for builtin formats with a changed color', () => {
    const onChange = vi.fn();
    const changed = { color_r: 0, color_g: 0, color_b: 0 };
    const { rerender } = render(
      <MappingColorField
        mapping={ORIGINAL}
        originalMapping={ORIGINAL}
        showReset
        onChange={onChange}
      />,
    );

    expect(screen.queryByText(/Restaurar color original/i)).not.toBeInTheDocument();

    rerender(
      <MappingColorField
        mapping={changed}
        originalMapping={ORIGINAL}
        showReset
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText(/Restaurar color original/i));
    expect(onChange).toHaveBeenCalledWith(ORIGINAL);
  });
});
