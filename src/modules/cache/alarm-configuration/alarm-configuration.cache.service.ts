import { Inject, Logger, LoggerService } from "@nestjs/common";
import { M500Service } from "#modules/postgres/m500.service";
import { AlarmConfiguration } from "#entities/alarm_configurations.entity";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { prepareConditionValue } from "#helpers/prepareConditionValue.helper";
import { PreparedAlarmConfigurationType } from "./types/PreparedAlarmConfiguration.type";

export class AlarmConfigurationCacheService {
    private alarmConfigurationMap = new Map<number, PreparedAlarmConfigurationType>();

    private firstCacheIsInited = false;

    constructor(
        private readonly m500Service: M500Service,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, AlarmConfigurationCacheService.name);
    }

    public async firstCacheInit(): Promise<void> {
        if (this.firstCacheIsInited === true) {
            this.logger.warn(`(firstCacheInit) the method has already called`);
            return;
        }
        this.logger.log(`FIRST INIITING...`);
        await this.initCache();
        this.logger.log(`FIRST INITING FINISHED.`);
    }

    public async initCache(): Promise<void> {
        try {
            const data = await this.m500Service.getExistAlarmConfigurations();
            const newMap = new Map();

            for (const item of data) {
                const preparedItem = this.prepareCacheItem(item);
                if (preparedItem === undefined) {
                    this.logger.error(
                        `(initCache) cannot prepare the item with alarm_config_id="${item.alarm_config_id}" cause something wrong with condition data`
                    );
                    continue;
                }
                newMap.set(item.alarm_config_id, preparedItem);
            }

            this.alarmConfigurationMap = newMap;
        } catch (e) {
            this.logger.error(e);
        }
    }

    private prepareCacheItem(item: AlarmConfiguration): PreparedAlarmConfigurationType | undefined {
        try {
            const preparedItem = {
                ...item,
                activation_condition_value: prepareConditionValue(item.activation_condition, item.activation_condition_value),
                finish_condition_value: item.finish_condition && item.finish_condition_value ?
                    prepareConditionValue(item.finish_condition, item.finish_condition_value) : undefined,
            }
            return preparedItem;
        } catch (e) {
            this.logger.error(e);
            return undefined;
        }

    }

    public getConfigsByAlias(alias: string): PreparedAlarmConfigurationType[] {
        const configs = Array.from(this.alarmConfigurationMap.values());
        const aliasConfigs = configs.filter(item => item.alias === alias);
        return aliasConfigs;
    }

    public getAllConfigs(): PreparedAlarmConfigurationType[] {
        const configs = Array.from(this.alarmConfigurationMap.values());
        return configs;
    }

    public getConfigByConfigId(configId: number): PreparedAlarmConfigurationType | undefined {
        return this.alarmConfigurationMap.get(configId);
    }
}