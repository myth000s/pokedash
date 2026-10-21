// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardImage } from './CardImage';

describe('CardImage', () => {
  it('shows the picture with the product name as alt text', () => {
    render(<CardImage src="https://www.cardtrader.com/x.jpg" alt="Raikou" />);
    expect(screen.getByRole('img', { name: 'Raikou' })).toHaveAttribute('src', '/api/card-image?src=' + encodeURIComponent('https://www.cardtrader.com/x.jpg'));
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
  it('sends no referrer with the picture request', () => {
    render(<CardImage src="https://www.cardtrader.com/x.jpg" alt="Raikou" />);
    expect(screen.getByRole('img', { name: 'Raikou' })).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
  describe('picture that failed before hydration', () => {
    afterEach(() => {
      delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
      delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
    });
    it('shows the placeholder when the mounted img is complete with no width', () => {
      Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
      Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 0 });
      render(<CardImage src="https://www.cardtrader.com/x.jpg" alt="Raikou" />);
      expect(screen.getByRole('img', { name: 'Raikou' })).toHaveTextContent('R');
    });
  });
});
