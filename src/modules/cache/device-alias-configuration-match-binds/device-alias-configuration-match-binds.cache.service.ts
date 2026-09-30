import { AlarmConfigurationBindsCacheService } from "#cache/alarm-configuration-binds/alarm-configuration-binds.cache.service";
import { AlarmConfigurationBlackListBindsCacheService } from "#cache/alarm-configuration-blacklist-binds/alarm-configuration-blacklist-binds.cache.service";
import { AlarmConfigurationCacheService } from "#cache/alarm-configuration/alarm-configuration.cache.service";
import { DeviceLocationsSiteBindsCacheService } from "#cache/device-locations-site-binds/device-locations-site-binds.cache.service";
import { Inject, Logger, LoggerService } from "@nestjs/common";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { PreparedAlarmConfigurationType } from "../alarm-configuration/types/PreparedAlarmConfiguration.type";
import { AliasConfigurationMatchBindsCacheItemType } from "./types/AliasConfigurationMatchBindsCacheItem.type";
import { DeviceAliasConfigurationMatchBindsMapType } from "./types/DeviceAliasConfigurationMatchBindsMap.type";
import { maxLifeMsOfCacheMatchBinds } from "#constants/maxLifeMsOfCacheMatchBinds";

// * кэш конфигураций подходящих проверки на алармы по каждому из устройств
export class DeviceAliasConfigurationMatchBindsCacheService {

    // Map<device_id, Map<alias, { configList: PreparedAlarmConfigurationType[], createdAt: isoString date }>>
    private deviceAliasConfigurationMatchBindsCache = new Map<number, DeviceAliasConfigurationMatchBindsMapType>();

    constructor(
        private readonly alarmConfigurationCacheService: AlarmConfigurationCacheService,
        private readonly alarmConfigurationBindsCacheService: AlarmConfigurationBindsCacheService,
        private readonly alarmConfigurationBlackListBindsCacheService: AlarmConfigurationBlackListBindsCacheService,
        private readonly deviceLocationsSiteBindsCacheService: DeviceLocationsSiteBindsCacheService,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, DeviceAliasConfigurationMatchBindsCacheService.name);
    }

    public getMatchListForDeviceAlias(device_id: number, alias: string): PreparedAlarmConfigurationType[] {
        const cachedDeviceMatchList =
            this.deviceAliasConfigurationMatchBindsCache.get(device_id)
            ?? new Map<string, AliasConfigurationMatchBindsCacheItemType>();

        const aliasConfigMatchBinds = cachedDeviceMatchList.get(alias) ?? {} as AliasConfigurationMatchBindsCacheItemType;
        if (aliasConfigMatchBinds && aliasConfigMatchBinds.createdAt) {
            const dateNow = new Date().valueOf();
            const cachedDate = new Date(aliasConfigMatchBinds.createdAt).valueOf();
            if (dateNow - cachedDate <= maxLifeMsOfCacheMatchBinds) {
                return aliasConfigMatchBinds.configList;
            }
        }

        const newDeviceAliasConfigurationMatchList = this.generateAliasWhiteListForDevice(device_id, alias);

        cachedDeviceMatchList.set(alias, { configList: newDeviceAliasConfigurationMatchList, createdAt: new Date().toISOString() });
        this.deviceAliasConfigurationMatchBindsCache.set(device_id, cachedDeviceMatchList);
        return newDeviceAliasConfigurationMatchList;
    }

    private generateAliasWhiteListForDevice(device_id: number, alias: string): PreparedAlarmConfigurationType[] {
        try {
            const newAliasConfigList: PreparedAlarmConfigurationType[] = [];

            const deviceInfo = this.deviceLocationsSiteBindsCacheService.getDeviceInfoByDeviceId(device_id);

            if (!deviceInfo?.locationPath || deviceInfo?.locationPath?.length === 0) {
                // only for trace
                // this.logger.debug!(
                //     `(generateAliasWhiteListForDevice) device location path is emty or not found for device_id="${device_id}"`
                // );
                return [];
            }

            const aliasConfigurationList = this.alarmConfigurationCacheService.getConfigsByAlias(alias);

            if (aliasConfigurationList.length === 0) {
                // only for trace
                // this.logger.debug!(
                //     `(generateAliasWhiteListForDevice) alias configuration list is empty for alias="${alias}"`
                // );
                return [];
            }

            const aliasConfigIdsSet = new Set<number>(aliasConfigurationList.map(item => item.alarm_config_id));


            const configIdOfBlackListBinds = this.alarmConfigurationBlackListBindsCacheService.findInCacheByFilterAndAliasConfigs({
                device_id: device_id,
                location_id: deviceInfo.locationPath, // массив чисел
                model_id: deviceInfo.model_id,
                server_alias_template_id: deviceInfo.server_alias_template_id,
                site_id: deviceInfo.site_id
            },
                aliasConfigIdsSet
            );


            const aliasConfigurationMatchList = this.alarmConfigurationBindsCacheService.findInCacheByFilterAndAliasConfigs({
                device_id: device_id,
                location_id: deviceInfo.locationPath, // массив чисел
                model_id: deviceInfo.model_id,
                server_alias_template_id: deviceInfo.server_alias_template_id,
                site_id: deviceInfo.site_id
            },
                configIdOfBlackListBinds,
                aliasConfigIdsSet
            );


            aliasConfigurationMatchList.forEach(alarm_config_id => {
                const configInfo = this.alarmConfigurationCacheService.getConfigByConfigId(alarm_config_id);
                if (!configInfo) {
                    return;
                }

                newAliasConfigList.push(configInfo);
            });

            return newAliasConfigList;
        }
        catch (e) {
            this.logger.error(
                `(generateAliasWhiteListForDevice) ERROR while processing generate alias match-list for device_id="${device_id}" and alias="${alias}"`
            );
            return [];
        }
    }

    public getAllMatchListForDevice(
        device_id: number,
        allAliasConfigs: PreparedAlarmConfigurationType[]
    ): Map<string, AliasConfigurationMatchBindsCacheItemType> {
        const cachedDeviceMatchList = this.generateWhiteListForDevice(device_id, allAliasConfigs);

        this.deviceAliasConfigurationMatchBindsCache.set(device_id, cachedDeviceMatchList);
        return cachedDeviceMatchList;
    }

    private generateWhiteListForDevice(device_id: number, allAliasConfigs: PreparedAlarmConfigurationType[]) {
        try {
            const newDeviceAliasConfigMap = new Map<string, AliasConfigurationMatchBindsCacheItemType>();

            if (allAliasConfigs.length === 0) {
                return newDeviceAliasConfigMap;
            }

            const deviceInfo = this.deviceLocationsSiteBindsCacheService.getDeviceInfoByDeviceId(device_id);

            if (!deviceInfo?.locationPath || deviceInfo?.locationPath?.length === 0) {
                return newDeviceAliasConfigMap;
            }

            if (allAliasConfigs.length === 0) {
                return newDeviceAliasConfigMap;
            }

            const aliasConfigIdsSet = new Set<number>(allAliasConfigs.map(item => item.alarm_config_id));

            const configIdOfBlackListBinds = this.alarmConfigurationBlackListBindsCacheService.findInCacheByFilterAndAliasConfigs({
                device_id: device_id,
                location_id: deviceInfo.locationPath, // массив чисел
                model_id: deviceInfo.model_id,
                server_alias_template_id: deviceInfo.server_alias_template_id,
                site_id: deviceInfo.site_id
            },
                aliasConfigIdsSet
            );

            const configurationMatchList = this.alarmConfigurationBindsCacheService.findInCacheByFilterAndAliasConfigs({
                device_id: device_id,
                location_id: deviceInfo.locationPath, // массив чисел
                model_id: deviceInfo.model_id,
                server_alias_template_id: deviceInfo.server_alias_template_id,
                site_id: deviceInfo.site_id
            },
                configIdOfBlackListBinds,
                aliasConfigIdsSet
            );


            configurationMatchList.forEach(alarm_config_id => {
                const configInfo = this.alarmConfigurationCacheService.getConfigByConfigId(alarm_config_id);
                if (!configInfo) {
                    return;
                }

                const aliasConfigs = newDeviceAliasConfigMap.get(configInfo.alias) ?? {
                    configList: [],
                    createdAt: new Date().toISOString()
                };
                aliasConfigs.configList.push(configInfo);
                newDeviceAliasConfigMap.set(configInfo.alias, aliasConfigs);
            });

            return newDeviceAliasConfigMap;
        }
        catch (e) {
            this.logger.error(
                `(generateWhiteListForDevice) ERROR while generating match-list for device_id="${device_id}"`
            );
            this.logger.error(e);
            return new Map<string, AliasConfigurationMatchBindsCacheItemType>();
        }
    }

    public clearMatchList(): void {
        this.deviceAliasConfigurationMatchBindsCache =
            new Map<number, DeviceAliasConfigurationMatchBindsMapType>();
        this.logger.log(`(clearMatchList) cache has been cleaned`)
    }
}