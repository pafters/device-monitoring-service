import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Inject,
  Injectable,
  Logger,
  LoggerService,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { addContextDecoratorLogger } from '#infrastructure/logger/context.decorator.logger';
import { SystemConfigService } from '#modules/system-config/system-config.service';
import { AlarmActiveAlarms } from '#entities/alarm_active_alarms.entity';
import { AlarmFinishedAlarmAwaitConfirmation } from '#entities/alarm_finished_alarm_await_confirmation.entity';
import { AlarmFinishedAlarms } from '#entities/alarm_finished_alarms.entity';

@Injectable()
export class M500Connection implements OnModuleInit, OnModuleDestroy {
  private postgres: DataSource;

  public alarmActiveAlarmsRepository: Repository<AlarmActiveAlarms>;
  public alarmFinishedAlarmsRepository: Repository<AlarmFinishedAlarms>;
  public alarmFinishedAlarmsAwaitConfirmationRepository: Repository<AlarmFinishedAlarmAwaitConfirmation>;

  constructor(
    @Inject(Logger) private readonly logger: LoggerService,
    private readonly systemConfig: SystemConfigService,
  ) {
    this.logger = addContextDecoratorLogger(logger, M500Connection.name);
  }

  async onModuleInit(): Promise<void> {
    this.init();
    this.logger.log('POSTGRESQL connecting...');
    await this.connect();
    this.logger.log('POSTGRESQL connection SUCCESS');

    this.alarmActiveAlarmsRepository = this.postgres.getRepository(AlarmActiveAlarms);
    this.alarmFinishedAlarmsRepository = this.postgres.getRepository(AlarmFinishedAlarms);
    this.alarmFinishedAlarmsAwaitConfirmationRepository = this.postgres.getRepository(AlarmFinishedAlarmAwaitConfirmation);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('POSTGRESQL disconnecting...');
    await this.postgres.destroy();
    this.logger.log('POSTGRESQL DISCONNECTED');
  }

  public async getRawSql<T = any>(query: string, params?: any[]): Promise<T> {
    const result = await this.postgres.query<T>(query, params);
    return result;
  }

  private init(): void {
    this.logger.log('POSTGRESQL initing...');

    this.postgres = new DataSource({
      type: 'postgres',
      ...this.systemConfig.postgresConfig,
      synchronize: false, // !!! при значении true таблица в базе данных перезапишется под структуру модели в коде. Влечет потери данных и связей
      entities: [
        AlarmActiveAlarms,
        AlarmFinishedAlarms,
        AlarmFinishedAlarmAwaitConfirmation
      ],
    });

    this.logger.log('POSTGRESQL inited');
  }

  private async connect(): Promise<void> {
    this.logger.log('POSTGRESQL connecting...');
    await this.postgres.initialize();
    this.logger.log('POSTGRESQL connection SUCCESS');
    // this.liveRepository = postgres.getRepository(Live);
  }
}
