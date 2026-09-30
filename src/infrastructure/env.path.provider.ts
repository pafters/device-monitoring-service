import { Logger } from '@nestjs/common';

export function envPathProvider(): string {
  switch (process.env.NODE_ENV) {
    case 'production':
      return '.env';
    // case 'development' || 'dev':
    //   return '.env.development';
    // case 'test' || 'testing':
    //   return '.env.testing';
    default:
      Logger.warn(
        `process.env.NODE_ENV value is inavlid. Current value is ${process.env.NODE_ENV}. Putting ".env.development as default")`,
      );
      return '.env.development';
  }
}
