import { ForbiddenException, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

@Injectable()
export class CeoSecretService {
  validateOrThrow(inputSecret: string): void {
    const realSecret = process.env.CEO_SECRET;

    if (!realSecret) {
      throw new Error('CEO_SECRET is not configured in .env');
    }

    const inputBuffer = Buffer.from(inputSecret ?? '');
    const realBuffer = Buffer.from(realSecret);

    const sameLength = inputBuffer.length === realBuffer.length;

    const isValid =
      sameLength && crypto.timingSafeEqual(inputBuffer, realBuffer);

    if (!isValid) {
      throw new ForbiddenException('Invalid CEO secret');
    }
  }
}
