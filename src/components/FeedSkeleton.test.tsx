// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedSkeleton } from './FeedSkeleton';

describe('FeedSkeleton', () => {
  it('announces loading', () => {
    render(<FeedSkeleton />);
    expect(screen.getByText('Loading deals…')).toBeInTheDocument(); // visually hidden text, container aria-busy="true"
  });
});
