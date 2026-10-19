import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest globals are off, so RTL does not unmount between tests on its own.
afterEach(() => cleanup());
