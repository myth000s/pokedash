// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { FormState } from '@/auth/actions';
import { LoginForm } from './LoginForm';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('LoginForm', () => {
  it('has labelled email and password inputs with autocomplete hints', () => {
    render(<LoginForm action={vi.fn<Action>(async () => ({}))} />);
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('name', 'email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('name', 'password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Log in' })).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('tells people who forgot their password to ask the owner', () => {
    render(<LoginForm action={vi.fn<Action>(async () => ({}))} />);
    expect(screen.getByText('Forgot your password? Ask the owner for a new starting password.')).toBeInTheDocument();
  });
  it('sends the fields to the action and shows its error in an alert', async () => {
    const action = vi.fn<Action>(async () => ({ error: 'Email or password is wrong.' }));
    render(<LoginForm action={action} />);
    fillAndSubmit('friend@example.com', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong.');
    const sent = action.mock.calls[0][1];
    expect(sent.get('email')).toBe('friend@example.com');
    expect(sent.get('password')).toBe('wrong-password');
    // The email stays filled in for the next try.
    expect(screen.getByLabelText('Email')).toHaveValue('friend@example.com');
  });
  it('removes the error while retrying, so a repeated error is announced again', async () => {
    let finish: (s: FormState) => void = () => {};
    const action = vi.fn<Action>()
      .mockResolvedValueOnce({ error: 'Email or password is wrong.' })
      .mockImplementationOnce(() => new Promise<FormState>((resolve) => { finish = resolve; }));
    render(<LoginForm action={action} />);
    fillAndSubmit('friend@example.com', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong.');
    fillAndSubmit('friend@example.com', 'wrong-password');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    act(() => finish({ error: 'Email or password is wrong.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong.');
  });
});
