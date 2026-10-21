import { describe, expect, it } from 'vitest';
import { resolveAuthState, statusPath } from './state';

describe('resolveAuthState', () => {
  it('treats no claims as anonymous', () => expect(resolveAuthState(null, null)).toEqual({ status: 'anonymous' }));
  it('sends AAL1 users without a factor to enrolment', () =>
    expect(resolveAuthState({ sub: 'u1', aal: 'aal1' }, 'aal1')).toEqual({ status: 'needs-mfa-enrolment', userId: 'u1' }));
  it('sends AAL1 users with a factor to verification', () =>
    expect(resolveAuthState({ sub: 'u1', aal: 'aal1' }, 'aal2')).toEqual({ status: 'needs-mfa-verification', userId: 'u1' }));
  it('requires a password change after MFA when flagged', () =>
    expect(resolveAuthState({ sub: 'u1', aal: 'aal2', user_metadata: { must_change_password: true } }, 'aal2').status).toBe('needs-password-change'));
  it('is ok at AAL2 without the flag', () => expect(resolveAuthState({ sub: 'u1', aal: 'aal2' }, 'aal2').status).toBe('ok'));
  it('never grants ok without an aal2 claim', () => {
    expect(resolveAuthState({ sub: 'u1' }, 'aal2').status).toBe('needs-mfa-verification');
    expect(resolveAuthState({ sub: 'u1', aal: 'AAL2' }, null).status).toBe('needs-mfa-enrolment');
  });
  it('treats claims without a subject as anonymous', () =>
    expect(resolveAuthState({ sub: '', aal: 'aal2' }, 'aal2')).toEqual({ status: 'anonymous' }));
  it('maps statuses to pages', () => {
    expect(statusPath('anonymous')).toBe('/login');
    expect(statusPath('needs-mfa-enrolment')).toBe('/mfa');
    expect(statusPath('needs-mfa-verification')).toBe('/mfa');
    expect(statusPath('needs-password-change')).toBe('/account/password');
    expect(statusPath('ok')).toBe('/');
  });
});
