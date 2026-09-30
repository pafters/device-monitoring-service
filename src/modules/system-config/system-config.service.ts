import {
  Inject,
  Injectable,
  Logger,
  LoggerService,
} from '@nestjs/common';
import { checkEnvNumber } from '#helpers/checkEnvNumber.helper';
import { checkEnvString } from '#helpers/checkEnvString.helper';
import { addContextDecoratorLogger } from '#infrastructure/logger/context.decorator.logger';
import { DBConfigType } from '#modules/postgres/types/DBConfig.type';
import { ValkeyConfigType } from '#modules/valkey/types/ValkeyConfig.type';
import { CronConfigsType } from './types/CronConfigs.type';

// !REVIEW Реализация в целом интересна. Я бы переделал следующие:
// 1) В функциях check, я бы по мимо проверки ещё бы сохранял конфигурации внутри приватных переменных класса
// 2) Все "getConfig" функции я бы переделал, что бы они выдавали копии сохранённых внутри приватных переменных классов
// Причина: переменные process.env могут быть изменены в ходе runtime, хоть это и не должно происходить, это возможно. Я бы хотел этого избежать обращаясь к process.env один раз, во время инициализации приложения.
@Injectable()
export class SystemConfigService {
  private dbHost: string | undefined;
  private dbPort: number | undefined;
  private dbUser: string | undefined;
  private dbPassword: string | undefined;
  private dbName: string | undefined;

  private valkeyHost: string | undefined;
  private valkeyPort: string | undefined;
  private valkeyDb: string | undefined;
  private valkeyAuthRequire: boolean;
  private valkeyUserName: string | undefined;
  private valkeyPassword: string | undefined;

  private cronIntervalForUpdateStaticCache: string | undefined;
  private cronIntervalForUpdateAlarmCache: string | undefined;
  private cronIntervalForUpdateAlarmConfigBindsCache: string | undefined;


  constructor(@Inject(Logger) private readonly logger: LoggerService) {
    this.logger = addContextDecoratorLogger(logger, SystemConfigService.name);
    this.checkDatabaseConfig();
    this.checkValkeyConfig();
    this.checkCronConfigs();
  }

  // Настройки подключения к базе данных
  private checkDatabaseConfig(): void {
    try {
      checkEnvString(process.env.DB_HOST, 'DB_HOST');
      checkEnvNumber(process.env.DB_PORT, 'DB_PORT');
      checkEnvString(process.env.DB_USER, 'DB_HOST');
      checkEnvString(process.env.DB_PASSWORD, 'DB_HOST');
      checkEnvString(process.env.DB_NAME, 'DB_HOST');

      this.dbHost = process.env.DB_HOST;
      this.dbPort = Number(process.env.DB_PORT);
      this.dbUser = process.env.DB_USER;
      this.dbPassword = process.env.DB_PASSWORD;
      this.dbName = process.env.DB_NAME;

    } catch (e) {
      this.logger.error(`(checkDatabaseConfig) Error while checking database config from enveronment`);
      this.logger.error(e);
      throw e;
    }
  }

  get postgresConfig(): DBConfigType {
    return {
      host: this.dbHost,
      port: this.dbPort,
      username: this.dbUser,
      password: this.dbPassword,
      database: this.dbName,
    };
  }

  private checkValkeyConfig(): void {
    this.logger.warn('(checkValkeyConfig) method just started');
    try {
      const valkeyRequire = process.env.VALKEY_AUTH_REQUIRE === 'true';
      checkEnvString(process.env.VALKEY_HOST, 'VALKEY_HOST');
      checkEnvNumber(process.env.VALKEY_PORT, 'VALKEY_PORT');
      checkEnvNumber(process.env.VALKEY_DB, 'VALKEY_DB');
      if (this.valkeyAuthRequire === true) {
        checkEnvString(process.env.VALKEY_USERNAME, 'VALKEY_USERNAME');
        checkEnvString(process.env.VALKEY_PASSWORD, 'VALKEY_PASSWORD');
      }

      this.valkeyAuthRequire = valkeyRequire;
      this.valkeyHost = process.env.VALKEY_HOST;
      this.valkeyPort = process.env.VALKEY_PORT;
      this.valkeyDb = process.env.VALKEY_DB;
      this.valkeyUserName = process.env.VALKEY_USERNAME;
      this.valkeyPassword = process.env.VALKEY_PASSWORD;
      this.logger.warn('(checkValkeyConfig) method has been finished');
    } catch (e) {
      this.logger.error(`ERROR (checkValkeyConfig)`);
      this.logger.error(e);
      throw e;
    }
  }

  get valkeyConfig(): ValkeyConfigType {
    const config: ValkeyConfigType = {
      host: this.valkeyHost,
      port: Number(this.valkeyPort),
      db: Number(this.valkeyDb),
      changesChannel: `__keyevent@${Number(this.valkeyDb)}__:set`
    };
    if (this.valkeyAuthRequire) {
      config.username = this.valkeyUserName;
      config.password = this.valkeyPassword;
    }
    return config;
  }

  checkCronConfigs(): void {
    checkEnvString(process.env.CRON_INTERVAL_FOR_UPDATE_STATIC_CACHE, 'CRON_INTERVAL_FOR_UPDATE_STATIC_CACHE');
    checkEnvString(process.env.CRON_INTERVAL_FOR_UPDATE_ALARM_CACHE, 'CRON_INTERVAL_FOR_UPDATE_ALARM_CACHE');
    checkEnvString(process.env.CRON_INTERVAL_FOR_UPDATE_ALARM_CONFIG_BINDS_CACHE, 'CRON_INTERVAL_FOR_UPDATE_ALARM_CONFIG_BINDS_CACHE');

    this.cronIntervalForUpdateStaticCache = process.env.CRON_INTERVAL_FOR_UPDATE_STATIC_CACHE;
    this.cronIntervalForUpdateAlarmCache = process.env.CRON_INTERVAL_FOR_UPDATE_ALARM_CACHE;
    this.cronIntervalForUpdateAlarmConfigBindsCache = process.env.CRON_INTERVAL_FOR_UPDATE_ALARM_CONFIG_BINDS_CACHE;
  }

  get cronConfig(): CronConfigsType {
    return {
      cronIntervalForUpdateAlarmConfigBindsCache: this.cronIntervalForUpdateAlarmConfigBindsCache,
      cronIntervalForUpdateStaticCache: this.cronIntervalForUpdateStaticCache,
      cronIntervalForUpdateAlarmCache: this.cronIntervalForUpdateAlarmCache,
    }
  }
}
