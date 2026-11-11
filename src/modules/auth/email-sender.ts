import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthConfig } from '../../common/config/env-config';

export const EMAIL_SENDER = 'KOVA_EMAIL_SENDER';

export interface EmailSender {
  assertReady(): void;
  sendVerificationCode(email: string, code: string): Promise<void>;
}

export class ResendEmailSender implements EmailSender {
  constructor(private readonly config: AuthConfig) {}

  assertReady(): void {
    if (!this.config.resendApiKey || !this.config.resendFromEmail) {
      throw new ServiceUnavailableException(
        'Email verification is not configured',
      );
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    this.assertReady();
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.resendFromEmail,
          to: [email],
          subject: 'Your Kova verification code',
          text: `Your Kova verification code is ${code}. It expires in 10 minutes.`,
          html: `<p>Your Kova verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Verification email could not be sent',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Verification email could not be sent',
      );
    }
  }
}
