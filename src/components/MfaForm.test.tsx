// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { EnrolmentResult, FormState } from '@/auth/actions';
import { MfaForm } from './MfaForm';

type Verify = (prev: FormState, form: FormData) => Promise<FormState>;
type Start = () => Promise<EnrolmentResult>;

const INTRO =
  'Scan this QR code with an authenticator app (for example Aegis, 2FAS, Google Authenticator or 1Password), then enter the 6-digit code.';
const enrolment = { factorId: 'f1', qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DPEHPK3PXP' };

function expectCodeInput() {
  const code = screen.getByLabelText('6-digit code');
  expect(code).toHaveAttribute('name', 'code');
  expect(code).toHaveAttribute('inputmode', 'numeric');
  expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  expect(code).toBeRequired();
  return code;
}

describe('MfaForm in enrolment mode', () => {
  it('does not enrol until the person asks to set up', () => {
    const start = vi.fn<Start>(async () => enrolment);
    render(<MfaForm mode="enrol" verifyAction={vi.fn<Verify>(async () => ({}))} startEnrolment={start} />);
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Set up authenticator' })).toBeInTheDocument();
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });
  it('shows the QR code, the secret and a code input once set up starts', async () => {
    const start = vi.fn<Start>(async () => enrolment);
    render(<MfaForm mode="enrol" verifyAction={vi.fn<Verify>(async () => ({}))} startEnrolment={start} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator' }));
    expect(await screen.findByAltText('QR code for your authenticator app')).toHaveAttribute('src', enrolment.qrCode);
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(screen.getByText(enrolment.secret)).toBeInTheDocument();
    expectCodeInput();
    expect(start).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).not.toBeInTheDocument();
  });
  it('moves focus to the instructions that replace the set-up button', async () => {
    render(<MfaForm mode="enrol" verifyAction={vi.fn<Verify>(async () => ({}))} startEnrolment={vi.fn<Start>(async () => enrolment)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator' }));
    await waitFor(() => expect(screen.getByText(INTRO)).toHaveFocus());
  });
  it('sends the code with the new factor id', async () => {
    const verify = vi.fn<Verify>(async () => ({ error: "That code didn't work. Check the time on your phone and try again." }));
    render(<MfaForm mode="enrol" verifyAction={verify} startEnrolment={vi.fn<Start>(async () => enrolment)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator' }));
    fireEvent.change(await screen.findByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work. Check the time on your phone and try again.");
    const sent = verify.mock.calls[0][1];
    expect(sent.get('code')).toBe('123456');
    expect(sent.get('factorId')).toBe('f1');
    // The QR code stays up for another try.
    expect(screen.getByAltText('QR code for your authenticator app')).toBeInTheDocument();
  });
  it('shows a failed set-up in an alert and lets the person try again', async () => {
    const start = vi.fn<Start>().mockResolvedValueOnce({ error: 'Login is not available right now.' }).mockResolvedValueOnce(enrolment);
    render(<MfaForm mode="enrol" verifyAction={vi.fn<Verify>(async () => ({}))} startEnrolment={start} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Login is not available right now.');
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator' }));
    expect(await screen.findByAltText('QR code for your authenticator app')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MfaForm in verification mode', () => {
  it('shows only the code input', () => {
    const start = vi.fn<Start>(async () => enrolment);
    render(<MfaForm mode="verify" verifyAction={vi.fn<Verify>(async () => ({}))} startEnrolment={start} />);
    expectCodeInput();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).not.toBeInTheDocument();
    expect(screen.queryByText(INTRO)).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });
  it('sends the code without a factor id and shows the error in an alert', async () => {
    const verify = vi.fn<Verify>(async () => ({ error: 'Enter the 6-digit code from your authenticator app.' }));
    render(<MfaForm mode="verify" verifyAction={verify} startEnrolment={vi.fn<Start>()} />);
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '12a456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the 6-digit code from your authenticator app.');
    const sent = verify.mock.calls[0][1];
    expect(sent.get('code')).toBe('12a456');
    expect(sent.has('factorId')).toBe(false);
    expect(screen.getByLabelText('6-digit code')).toHaveAttribute('aria-describedby', 'mfa-error');
  });
});
