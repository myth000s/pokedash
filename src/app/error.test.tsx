// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorPage from './error';

describe('error page', () => {
  it('shows a friendly message without the error text and retries on click', () => {
    const retry = vi.fn();
    render(<ErrorPage error={new Error('password=hunter2 at db.internal')} retry={retry} />);
    expect(screen.getByText("Couldn't load this page right now.")).toBeInTheDocument();
    expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
