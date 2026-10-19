// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardImage } from './CardImage';

describe('CardImage', () => {
  it('shows the picture with the product name as alt text', () => {
    render(<CardImage src="https://www.cardtrader.com/x.jpg" alt="Raikou" />);
    expect(screen.getByRole('img', { name: 'Raikou' })).toHaveAttribute('src', 'https://www.cardtrader.com/x.jpg');
  });
  it('falls back to a placeholder when there is no picture', () => {
    render(<CardImage src={null} alt="Raikou" />);
    expect(screen.getByRole('img', { name: 'Raikou' })).toHaveTextContent('R');
  });
  it('falls back to the placeholder when the picture fails to load', () => {
    render(<CardImage src="https://www.cardtrader.com/x.jpg" alt="Raikou" />);
    fireEvent.error(screen.getByRole('img', { name: 'Raikou' }));
    expect(screen.getByRole('img', { name: 'Raikou' })).toHaveTextContent('R');
  });
});
