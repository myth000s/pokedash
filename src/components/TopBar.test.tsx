// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from './TopBar';

const NOW = new Date('2026-10-19T12:00:00Z');

describe('TopBar', () => {
  it('shows the wordmark, the set and when listings were last checked', () => {
    render(<TopBar setName="30th Celebration" lastCheckedAt={new Date(NOW.getTime() - 5 * 60_000)} now={NOW} />);
    expect(screen.getByRole('heading', { level: 1, name: 'pokedash' })).toBeInTheDocument();
    expect(screen.getByText('Set: 30th Celebration')).toBeInTheDocument();
    expect(screen.getByText('Live · checked 5 min ago')).toBeInTheDocument();
  });
  it('says when nothing has been checked yet', () => {
    render(<TopBar setName="30th Celebration" lastCheckedAt={null} now={NOW} />);
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
  });
});
