import { describe, expect, it } from 'vitest';
import { proxyDecision } from './paths';

const aal1 = { sub: 'u', aal: 'aal1' };
const aal2 = { sub: 'u', aal: 'aal2' };
const mustChange = { ...aal2, user_metadata: { must_change_password: true } };

describe('proxyDecision', () => {
  it.each([
    ['/impressum', null, { action: 'next' }],
    ['/impressum/', null, { action: 'next' }],
    ['/login', aal2, { action: 'next' }],
    ['/', null, { action: 'redirect', to: '/login' }],
    ['/?tab=sealed', null, { action: 'redirect', to: '/login' }],
    ['/mfa', null, { action: 'redirect', to: '/login' }],
    ['/mfa', aal1, { action: 'next' }],
    ['/', aal1, { action: 'redirect', to: '/mfa' }],
    ['/account/password', aal1, { action: 'redirect', to: '/mfa' }],
    ['/', mustChange, { action: 'redirect', to: '/account/password' }],
    ['/account/password', mustChange, { action: 'next' }],
    ['/api/card-image', null, { action: 'unauthorized' }],
    ['/api/card-image', aal1, { action: 'unauthorized' }],
    ['/api/card-image', aal2, { action: 'next' }],
    ['/', aal2, { action: 'next' }],
    ['/impressum/../', null, { action: 'redirect', to: '/login' }],
    ['/impressum/x', null, { action: 'redirect', to: '/login' }],
  ])('%s', (path, claims, expected) => expect(proxyDecision(path, claims as never)).toEqual(expected));
});
