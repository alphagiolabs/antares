import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('HidroConvert')).toBeInTheDocument();
  });

  it('shows conversion tab by default', () => {
    render(<App />);
    expect(screen.getByText('Archivos de origen')).toBeInTheDocument();
  });
});
