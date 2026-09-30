import {
  Inject,
  Injectable,
  Logger,
  LoggerService,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

import { addContextDecoratorLogger } from '#infrastructure/logger/context.decorator.logger';
import { SystemConfigService } from '#modules/system-config/system-config.service';

@Injectable()
export class ValkeyConnection implements OnModuleInit, OnModuleDestroy {
  public valkeyClient: Redis;

  public valkeySubscriber: Redis;

  constructor(
    @Inject(Logger) private readonly logger: LoggerService,
    private readonly systemConfig: SystemConfigService,
  ) {
    this.valkeyClient = new Redis(this.systemConfig.valkeyConfig);
    this.valkeySubscriber = new Redis(this.systemConfig.valkeyConfig);
    this.logger = addContextDecoratorLogger(logger, ValkeyConnection.name);
  }

  onModuleInit(): void {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.valkeyClient.quit();
    this.logger.log('Valkey: DISCONNECTED');
  }

  private connect(): void {
    this.valkeyClient.on('connect', () => {
      this.logger.log('Valkey: CONNECTION SUCCESS IN ValkeyConnection');
    });
  }
}
