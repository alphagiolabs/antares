import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Conversión')).toBeInTheDocument();
  });

  it('shows conversion tab by default', () => {
    render(<App />);
    expect(screen.getByText('Arrastra imágenes aquí')).toBeInTheDocument();
  });

  it('keeps start disabled until files and destination are ready', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /Iniciar conversión/i })).toBeDisabled();
  });

  it('has sidebar with navigation buttons', () => {
    render(<App />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });
});
