import { NestFactory } from '@nestjs/core';
import { AppModule } from '#/app.module';
import { ConsoleLogger } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const consoleLogger = new ConsoleLogger({
    colors: process.env.NODE_ENV !== 'production',
    logLevels: ['log', 'warn', 'error', 'fatal'],
  });

  const app = await NestFactory.create(AppModule, { logger: consoleLogger });
  await app.listen(process.env.BIND_PORT ?? 3000);
}
void bootstrap();