// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { FormState } from '@/auth/actions';
import { PasswordForm } from './PasswordForm';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

describe('PasswordForm', () => {
  it('has two labelled new-password inputs', () => {
    render(<PasswordForm action={vi.fn<Action>(async () => ({}))} />);
    const password = screen.getByLabelText('New password');
    expect(password).toHaveAttribute('name', 'password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toBeRequired();
    const confirm = screen.getByLabelText('Repeat new password');
    expect(confirm).toHaveAttribute('name', 'confirm');
    expect(confirm).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm).toBeRequired();
    // No maxLength: a longer pasted password must reach the server and fail there, not be cut silently.
    expect(password).not.toHaveAttribute('maxlength');
    expect(screen.getByRole('button', { name: 'Change password' })).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('sends both fields to the action and shows its error in an alert', async () => {
    const action = vi.fn<Action>(async () => ({ error: "The passwords don't match." }));
    render(<PasswordForm action={action} />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'first-try-password' } });
    fireEvent.change(screen.getByLabelText('Repeat new password'), { target: { value: 'first-try-passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("The passwords don't match.");
    const sent = action.mock.calls[0][1];
    expect(sent.get('password')).toBe('first-try-password');
    expect(sent.get('confirm')).toBe('first-try-passw0rd');
  });
});
