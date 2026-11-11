import type { EmailSender } from '../../src/modules/auth/email-sender';

export class FakeEmailSender implements EmailSender {
  private readonly codesByAddress = new Map<string, string>();

  assertReady(): void {}

  async sendVerificationCode(email: string, code: string): Promise<void> {
    this.codesByAddress.set(email, code);
  }

  codeFor(email: string): string | undefined {
    return this.codesByAddress.get(email);
  }
}
