// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { signOut } from '@/auth/actions';
import { TopBar } from './TopBar';

vi.mock('@/auth/actions', () => ({ signOut: vi.fn(async () => {}) }));

const NOW = new Date('2026-10-19T12:00:00Z');

describe('TopBar', () => {
  it('shows the wordmark, the set and when listings were last checked', () => {
    render(<TopBar setName="30th Celebration" lastCheckedAt={new Date(NOW.getTime() - 5 * 60_000)} now={NOW} />);
    expect(screen.getByRole('heading', { level: 1, name: 'pokedash' })).toBeInTheDocument();
    expect(screen.getByText('Set: 30th Celebration')).toBeInTheDocument();
    expect(screen.getByText('Live · checked 5 min ago')).toBeInTheDocument();
  });
  it('says All sets when no set is chosen', () => {
    render(<TopBar setName={null} lastCheckedAt={null} now={NOW} />);
    expect(screen.getByText('All sets')).toBeInTheDocument();
  });
  it('says when nothing has been checked yet', () => {
    render(<TopBar setName="30th Celebration" lastCheckedAt={null} now={NOW} />);
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
  });
  it('has a sign-out button that calls the sign-out action', async () => {
    render(<TopBar setName="30th Celebration" lastCheckedAt={null} now={NOW} />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button).toHaveAttribute('type', 'submit');
    fireEvent.click(button);
    await waitFor(() => expect(vi.mocked(signOut)).toHaveBeenCalledOnce());
  });
});
