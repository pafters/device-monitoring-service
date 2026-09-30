
import { addContextDecoratorLogger } from '#infrastructure/logger/context.decorator.logger';
import { SystemConfigService } from '#modules/system-config/system-config.service';
import { Inject, Logger, LoggerService, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { AlarmActiveAlarmsCacheService } from './alarm-active-alarms/alarm-active-alarms.cache.service';
import { AlarmConfigurationCacheService } from './alarm-configuration/alarm-configuration.cache.service';
import { AlarmConfigurationBindsCacheService } from './alarm-configuration-binds/alarm-configuration-binds.cache.service';
import { AlarmConfigurationBlackListBindsCacheService } from './alarm-configuration-blacklist-binds/alarm-configuration-blacklist-binds.cache.service';
import { AlarmFinishedAlarmsCacheService } from './alarm-finished-alarms/alarm-finished-alarms.cache.service';
import { DeviceAliasConfigurationMatchBindsCacheService } from './device-alias-configuration-match-binds/device-alias-configuration-match-binds.cache.service';
import { DeviceLocationsSiteBindsCacheService } from './device-locations-site-binds/device-locations-site-binds.cache.service';
import { DeviceModemBindsCacheService } from './device-modem-binds/device-modem-binds.cache.service';
import { schedule } from 'node-cron';
import { EventChannels } from '#constants/EventChannels.enum';
export class BaseCacheService implements OnModuleInit {

    private eventEmitter = new EventEmitter();
    // по сути сюда будут прилетать события по кэшированию данных
    // и этот класс в свою очередь будет уведомлять об обновлении классы-подписчики (например AlarmProcessorService)
    constructor(
        private readonly systemConfig: SystemConfigService,
        private readonly alarmActiveAlarmsCacheService: AlarmActiveAlarmsCacheService,
        private readonly alarmConfigurationCacheService: AlarmConfigurationCacheService,
        private readonly alarmConfigurationBindsCacheService: AlarmConfigurationBindsCacheService,
        private readonly alarmConfigurationBlackListBindsCacheService: AlarmConfigurationBlackListBindsCacheService,
        private readonly alarmFinishedAlarmsCacheService: AlarmFinishedAlarmsCacheService,
        private readonly deviceConfigurationMatchBindsCacheService: DeviceAliasConfigurationMatchBindsCacheService,
        private readonly deviceLocationsSiteBindsCacheService: DeviceLocationsSiteBindsCacheService,
        private readonly deviceModemBindsCacheService: DeviceModemBindsCacheService,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, BaseCacheService.name);
    }

    async onModuleInit(): Promise<void> {
        this.logger.log('FIRST INITING...');
        this.firstInit().then(() => {
            this.logger.log('FIRST INITING FINISHED...');
            this.notifyAboutAllCacheUpdated();
            this.startIntervalUpdate();
        }).catch(e => {
            this.logger.error(`(onModuleInit) ERROR whilte first initing the module`);
            this.logger.error(e);
            // считаем фатальной ошибкой, по которой можно полность завершать работу приложения
            process.exit(1);
        })
    }

    private async firstInit(): Promise<void> {
        // все ниже - что нужно для мэтч-листа до того как его вызовут
        await this.alarmConfigurationCacheService.firstCacheInit();
        await this.alarmConfigurationBindsCacheService.firstCacheInit();
        await this.alarmConfigurationBlackListBindsCacheService.firstCacheInit();
        await this.deviceLocationsSiteBindsCacheService.firstCacheInit();
        await this.deviceModemBindsCacheService.firstCacheInit();

        await this.alarmActiveAlarmsCacheService.firstCacheInit();
        await this.alarmFinishedAlarmsCacheService.firstCacheInit();

        this.deviceConfigurationMatchBindsCacheService.clearMatchList();

    }

    private startIntervalUpdate(): void {
        const task = schedule(this.systemConfig.cronConfig.cronIntervalForUpdateAlarmConfigBindsCache!,
            async () => {
                try {
                    await this.updateAlarmConfigsCache();
                } catch (e) {
                    this.logger.error(`(startIntervalUpdate) ERROR while processing cron schedule`);
                    this.logger.error(e);
                }
            }
        );
        task.start();
        this.logger.log(
            `The schedule (updateAlarmConfigsCache) has been added and started with interval: "${this.systemConfig.cronConfig.cronIntervalForUpdateStaticCache}"`,
        );
    }

    private async updateAlarmConfigsCache(): Promise<void> {
        await this.alarmConfigurationCacheService.initCache();
        await this.alarmConfigurationBindsCacheService.initCache();
        await this.alarmConfigurationBlackListBindsCacheService.initCache();
        await this.deviceLocationsSiteBindsCacheService.initCache();
        await this.deviceModemBindsCacheService.initCache();

        this.deviceConfigurationMatchBindsCacheService.clearMatchList();
        this.notifyAboutAlarmConfigsCacheUpdated();
    }

    private notifyAboutAlarmConfigsCacheUpdated(): void {
        this.logger.log(`(notifyAboutAlarmConfigsCacheUpdated) SENDED`);
        this.eventEmitter.emit(EventChannels.ALARM_CACHE_UPDATED, {});
    }

    private notifyAboutAllCacheUpdated(): void {
        this.logger.log(`(notifyAboutAllCacheUpdated) SENDED`);
        this.eventEmitter.emit(EventChannels.ALL_CACHE_UPDATED, {});
    }

    public subscribeToUpdateAllCacheEvent(callback: () => void | Promise<void>): void {
        this.eventEmitter.on(EventChannels.ALL_CACHE_UPDATED, async () => {
            try {
                this.logger.log(`(subscribeToUpdateAllCacheEvent) HANDLED`);
                callback();
            } catch (e) {
                this.logger.error(
                    `(subscribeToUpdateAllCacheEvent) UNHANDLED ERROR ON EVENT ${EventChannels.ALL_CACHE_UPDATED}`,
                );
                this.logger.error(e);
            }
        });
    }

    public subscribeToUpdateAlarmConfigsCacheEvent(callback: () => void | Promise<void>): void {
        this.eventEmitter.on(EventChannels.ALARM_CACHE_UPDATED, async () => {
            try {
                this.logger.log(`(subscribeToUpdateAlarmConfigsCacheEvent) HANDLED`);
                callback();
            } catch (e) {
                this.logger.error(
                    `(subscribeToUpdateAlarmConfigsCacheEvent) UNHANDLED ERROR ON EVENT ${EventChannels.ALL_CACHE_UPDATED}`,
                );
                this.logger.error(e);
            }
        });
    }
}