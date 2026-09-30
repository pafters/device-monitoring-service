import { Logger, Module } from '@nestjs/common';

import { SystemConfigModule } from '#modules/system-config/system-config.module';
import { AlarmConfigurationBindsCacheService } from '#cache/alarm-configuration-binds/alarm-configuration-binds.cache.service';
import { AlarmConfigurationCacheService } from '#cache/alarm-configuration/alarm-configuration.cache.service';
import { AlarmActiveAlarmsCacheService } from '#cache/alarm-active-alarms/alarm-active-alarms.cache.service';
import { AlarmConfigurationBlackListBindsCacheService } from '#cache/alarm-configuration-blacklist-binds/alarm-configuration-blacklist-binds.cache.service';
import { AlarmFinishedAlarmsCacheService } from '#cache/alarm-finished-alarms/alarm-finished-alarms.cache.service';
import { DeviceLocationsSiteBindsCacheService } from '#cache/device-locations-site-binds/device-locations-site-binds.cache.service';
import { DeviceModemBindsCacheService } from '#cache/device-modem-binds/device-modem-binds.cache.service';
import { BaseCacheService } from '#cache/base-cache.service';
import { DeviceAliasConfigurationMatchBindsCacheService } from './device-alias-configuration-match-binds/device-alias-configuration-match-binds.cache.service';
import { M500Module } from '#modules/postgres/m500.module';

@Module({
    imports: [SystemConfigModule, M500Module],
    providers: [
        Logger,
        AlarmActiveAlarmsCacheService,
        AlarmConfigurationCacheService,
        AlarmConfigurationBindsCacheService,
        AlarmConfigurationBlackListBindsCacheService,
        AlarmFinishedAlarmsCacheService,
        DeviceLocationsSiteBindsCacheService,
        DeviceModemBindsCacheService,
        DeviceAliasConfigurationMatchBindsCacheService,
        BaseCacheService,
    ],
    exports: [
        AlarmConfigurationCacheService,
        AlarmConfigurationBindsCacheService,
        AlarmActiveAlarmsCacheService,
        AlarmConfigurationBlackListBindsCacheService,
        AlarmFinishedAlarmsCacheService,
        DeviceLocationsSiteBindsCacheService,
        DeviceModemBindsCacheService,
        DeviceAliasConfigurationMatchBindsCacheService,
        BaseCacheService,
    ],
})
export class BaseCacheModule { }
