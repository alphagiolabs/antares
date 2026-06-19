import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Sidebar from '../Sidebar';
import { TAB_DEFINITIONS } from '../../../navigation';

const STORAGE_KEY = 'antares_sidebar_expanded';

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not show the removed brand tagline', () => {
    const removedTagline = ['Precision', 'tools'].join(' ');

    render(
      <Sidebar
        activeTab="convert"
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(removedTagline)).not.toBeInTheDocument();
  });

  it('does not render the removed sidebar search shortcut', () => {
    render(
      <Sidebar
        activeTab="convert"
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Buscar')).not.toBeInTheDocument();
    expect(screen.queryByText('Ctrl+K')).not.toBeInTheDocument();
  });

  it('renders the sidebar toggle with the expected label', () => {
    render(
      <Sidebar
        activeTab="convert"
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Alternar barra lateral' })).toBeInTheDocument();
  });

  it('collapses and expands when toggled', () => {
    render(
      <Sidebar
        activeTab="convert"
        onTabChange={vi.fn()}
      />,
    );

    const sidebar = screen.getByTestId('app-sidebar');
    const toggle = screen.getByTestId('sidebar-toggle');

    expect(sidebar).toHaveAttribute('data-expanded', 'true');

    fireEvent.click(toggle);
    expect(sidebar).toHaveAttribute('data-expanded', 'false');

    fireEvent.click(toggle);
    expect(sidebar).toHaveAttribute('data-expanded', 'true');
  });

  it('persists the collapsed state in localStorage', () => {
    render(
      <Sidebar
        activeTab="convert"
        onTabChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('keeps all current navigation sections', () => {
    render(
      <Sidebar
        activeTab="convert"
        onTabChange={vi.fn()}
      />,
    );

    for (const tab of TAB_DEFINITIONS) {
      expect(screen.getByRole('button', { name: tab.label })).toBeInTheDocument();
    }
  });

  it('calls onTabChange when a navigation item is clicked', () => {
    const onTabChange = vi.fn();

    render(
      <Sidebar
        activeTab="convert"
        onTabChange={onTabChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Conversión' }));
    expect(onTabChange).toHaveBeenCalledWith('convert');
  });

  it('does not render history or appearance as sidebar navigation items', () => {
    render(
      <Sidebar
        activeTab="convert"
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Historial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apariencia' })).not.toBeInTheDocument();
  });
});
