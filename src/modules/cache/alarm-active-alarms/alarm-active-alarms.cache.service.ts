import { Inject, Logger, LoggerService, OnModuleInit } from "@nestjs/common";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { M500Service } from "#modules/postgres/m500.service";
import { AlarmActiveAlarmsMapItemType } from "#cache/alarm-active-alarms/types/AlarmActiveAlarmsMapItem.type";
import { AlarmActiveAlarmsWithAliasItemType } from "#modules/postgres/types/AlarmActiveAlarmsWithAliasItem.type";
import { schedule } from 'node-cron';
import { SystemConfigService } from "#modules/system-config/system-config.service";
import { DeviceLocationsSiteBindsMapItemType } from "../device-locations-site-binds/types/DeviceLocationsSiteBindsMapItem.type";
import { ValkeyItemType } from "#modules/valkey/types/ValkeyItem.type";
import * as crypto from 'node:crypto';
import { MainModemDataType } from "#modules/postgres/types/MainModemData.type";
import { PreparedAlarmConfigurationType } from "../alarm-configuration/types/PreparedAlarmConfiguration.type";
import { AlarmActiveAlarmsDTO } from "#/dto/AlarmActiveAlarms.dto";
import { PreDeviceActiveAlarmsMapItemType } from "./types/PreDeviceActiveAlarmsMapItem.type";
import { PreActiveAlarmItemType } from "./types/PreActiveAlarmItem.type";
import { LiveHadledValueType } from "#/types/LiveHadledValue.type";
import { EntityManager } from "typeorm";

export class AlarmActiveAlarmsCacheService {

    private deviceActiveAlarmsMap = new Map<number, AlarmActiveAlarmsMapItemType>();
    private preDeviceActiveAlarmsMap = new Map<number, PreDeviceActiveAlarmsMapItemType>();

    private firstCacheIsInited = false;

    constructor(
        private readonly m500Service: M500Service,
        private readonly systemConfig: SystemConfigService,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, AlarmActiveAlarmsCacheService.name);
    }

    private startIntervalUpdate(): void {
        const task = schedule(this.systemConfig.cronConfig.cronIntervalForUpdateAlarmCache!,
            async () => {
                try {
                    await this.initCache();
                } catch (e) {
                    this.logger.error(`(startIntervalUpdate) ERROR while processing cron schedule`);
                    this.logger.error(e);
                }
            }
        );
        task.start();
        this.logger.log(
            `The schedule (initCache) has been added and started with interval: "${this.systemConfig.cronConfig.cronIntervalForUpdateAlarmCache}"`,
        );
    }

    public async firstCacheInit(): Promise<void> {
        if (this.firstCacheIsInited === true) {
            this.logger.warn(`(firstCacheInit) the method has already called`);
            return;
        }
        this.logger.log(`FIRST INIITING...`);
        await this.initCache();
        this.logger.log(`FIRST INITING FINISHED.`);
        this.startIntervalUpdate();
    }

    private async initCache(): Promise<void> {
        try {
            const data = await this.m500Service.getAllAlarmActiveAlarms();

            const newAlarmActiveAlarmsMap = new Map<number, AlarmActiveAlarmsMapItemType>();
            for (const item of data) {
                const deviceAlarms = newAlarmActiveAlarmsMap.get(item.device_id) ?? {};

                if (!deviceAlarms[item.alarm_config_id]) {
                    deviceAlarms[item.alarm_config_id] = item

                }
                newAlarmActiveAlarmsMap.set(item.device_id, deviceAlarms);
            }

            this.deviceActiveAlarmsMap = newAlarmActiveAlarmsMap;
        } catch (e) {
            this.logger.error(e);
        }
    }

    // метод удаления из таблицы и кэша по alarm_config_id и device_id
    public async removeFromActiveAlarms(device_id: number, alarm_config_id: number): Promise<void> {
        try {
            await this.m500Service.removeAlarmFromActiveAlarms(alarm_config_id, device_id);
            this.removeFromActiveAlarmsCache(device_id, alarm_config_id);
        } catch (e) {
            this.logger.error(e);
        }
    }

    // метод удаления из кэша по alarm_config_id и device_id
    public removeFromActiveAlarmsCache(device_id: number, alarm_config_id: number): void {
        const activeDeviceAlarms = this.deviceActiveAlarmsMap.get(device_id);
        if (!activeDeviceAlarms) {
            this.logger.warn(`(removeFromActiveAlarmsCache) NO alarms with device_id=${device_id} were found`);
            return;
        }
        const alarmForRemoving = activeDeviceAlarms[alarm_config_id];
        if (!alarmForRemoving) {
            this.logger.warn(
                `(removeFromActiveAlarmsCache) The alarm with device_id=${device_id} and alarm_config_id=${alarm_config_id} to be removed not found`
            );
            return;
        }
        delete activeDeviceAlarms[alarm_config_id];
        this.logger.warn(
            `(removeFromActiveAlarmsCache) The alarm with alarm_config_id=${alarm_config_id} has been removed from alarm active alarms cache for device_id=${device_id}`
        );
        return;
    }

    // метод добавления аларма (пока не знаю какие аргументы передавать, + нужно сформировать guid)
    public async addToActiveAlarmsIfIsNotExist(
        alarmConfigInfo: PreparedAlarmConfigurationType,
        deviceInfo: DeviceLocationsSiteBindsMapItemType,
        modemInfo: MainModemDataType,
        liveData: ValkeyItemType,
        activation_value: LiveHadledValueType,
    ): Promise<void> {
        const { device_id } = deviceInfo;
        // проверить есть ли запись в кэше, 
        const existActiveAlarm = this.getActiveAlarmsByDeviceIdConfigId(device_id, alarmConfigInfo.alarm_config_id);

        if (existActiveAlarm) {
            return;
        }

        // если записи нет,то
        //      подготовка к активации
        const alarmItem = this.prepareToActivation(
            alarmConfigInfo,
            deviceInfo,
            modemInfo,
            liveData,
            activation_value
        );
        //      создать запись в таблицу
        await this.m500Service.addAlarmToActiveAlarms(alarmItem);
        //      добавить запись в кэш
        this.addAlarmToActiveAlarmsCache(device_id, alarmItem, alarmConfigInfo);
        this.logger.warn(
            `(addToActiveAlarms) ALARM ACTIVATED (alarm_activation_guid="${alarmItem.alarm_activation_guid}") FOR device_id="${device_id}" alias="${alarmConfigInfo.alias}" alarm_config_id="${alarmConfigInfo.alarm_config_id}"`
        )
        return;

    }

    public async forceRemoveFromActiveAlarms(device_id: number, alarm_config_id: number) {
        try {
            this.removeFromActiveAlarms(device_id, alarm_config_id);
            this.removeFromPreActiveAlarmsIfExist(device_id, alarm_config_id);
        } catch (e) {
            this.logger.error(`(forceRemoveFromActiveAlarms) ERROR WHILE REMOVING FROM ACTIVE ALARMS`);
        }
    }

    private prepareToActivation(
        alarmConfigInfo: PreparedAlarmConfigurationType,
        deviceInfo: DeviceLocationsSiteBindsMapItemType,
        modemInfo: MainModemDataType,
        liveData: ValkeyItemType,
        activation_value: LiveHadledValueType,
    ): AlarmActiveAlarmsDTO {
        const debug_info = {
            deviceInfo,
            modemInfo,
            liveData,
            alarmConfigInfo
        } as Record<string, any>;

        const item = {
            alarm_activation_guid: crypto.randomUUID(),
            alarm_config_id: alarmConfigInfo.alarm_config_id,
            device_id: deviceInfo.device_id,
            dt_start: new Date().toISOString(),
            activation_value: String(activation_value),
            debug_info: debug_info,
        } as AlarmActiveAlarmsDTO;

        return item;
    }

    private addAlarmToActiveAlarmsCache(
        device_id: number,
        alarm: AlarmActiveAlarmsDTO,
        alarmConfigInfo: PreparedAlarmConfigurationType
    ): void {
        const cacheItem = { ...alarm, alias: alarmConfigInfo.alias } as AlarmActiveAlarmsWithAliasItemType;
        const deviceAlarms = this.deviceActiveAlarmsMap.get(device_id) ?? {} as AlarmActiveAlarmsMapItemType;
        deviceAlarms[alarm.alarm_config_id] = cacheItem;
        this.deviceActiveAlarmsMap.set(device_id, deviceAlarms);
    }

    // метод получения всех записей по device_id, в аларм процессоре дальше будет проверка удален ли указанный конфиг
    public getAllActiveAlarmsByDeviceId(device_id: number): AlarmActiveAlarmsWithAliasItemType[] {
        const data = this.deviceActiveAlarmsMap.get(device_id);
        return data ? Object.values(data) : [];
    }

    public getActiveAlarmsByDeviceIdConfigId(
        device_id: number,
        alarm_config_id: number
    ): AlarmActiveAlarmsWithAliasItemType | undefined {
        const data = this.deviceActiveAlarmsMap.get(device_id);
        if (!data) {
            return undefined;
        }
        return data[alarm_config_id];
    }

    // метод получения всех записей, дальше (
    //  в аларм процессоре будет проверка удалены ли указанный конфиг или связка с устройством/
    //  в liveDataCache запрошены оперативные данные при первом запуске
    // )
    public getAllDeviceActiveAlarms(): AlarmActiveAlarmsWithAliasItemType[] {
        const alarmMapItems = this.deviceActiveAlarmsMap.values();
        const alarmList: AlarmActiveAlarmsWithAliasItemType[] = [];
        for (const item of alarmMapItems) {
            const deviceAlarms = Object.values(item);
            alarmList.push(...deviceAlarms);
        }
        return alarmList;
    }

    public async deleteActiveAlarmsByDeviceId(device_id: number): Promise<void> {
        await this.m500Service.deleteAllActiveAlarmsByDeviceId(device_id);
        // удаляем из кэша
        this.deviceActiveAlarmsMap.delete(device_id);
    }

    public async deleteActiveAlarmsByDeviceIdAlarmConfigId(device_id: number, alarm_config_id: number): Promise<void> {
        await this.m500Service.deleteAllActiveAlarmsByDeviceIdAlarmConfigId(device_id, alarm_config_id);

        // удаляем из кэша
        const deviceActiveAlarms = this.deviceActiveAlarmsMap.get(device_id);
        if (!deviceActiveAlarms) {
            return;
        }
        const alarmForDelete = deviceActiveAlarms[alarm_config_id];
        if (!alarmForDelete) {
            return;
        }
        delete alarmForDelete[alarm_config_id];
        this.deviceActiveAlarmsMap.set(device_id, alarmForDelete);
        this.logger.warn(
            `(addToActiveAlarms) ALL ALARMS FINISHED FOR device_id="${device_id}" alias="${alarm_config_id}"`
        )
    }


    /*
     * ОТЛОЖЕННЫЕ АЛАРМЫ
    */

    addToPreActiveAlarmsIfIsNotExist(
        device_id: number,
        alarm_config_id: number,
        fixedValue: LiveHadledValueType,
        alias: string,
        valkeyKey: string,
        timeToRealActivateMs: number,
    ): void {
        const devicePreActiveAlarms = this.preDeviceActiveAlarmsMap.get(device_id) ?? {};

        const preActiveAlarmItem = {
            fixedValue: fixedValue,
            fixedAt: new Date().valueOf(),
            alias: alias,
            device_id: device_id,
            alarm_config_id: alarm_config_id,
            valkeyKey,
            // так как считаем, что изменение конфигурации влечет удаление прошлой версии и создание измененной как новую запись,
            // то время на отложенную активацию можем считать фиксированной, и не требующей последующей повторной сверки c конфигурацией
            // в методе проверки на реальную активацию - Согласовано с Леонидом Соломенниковым
            timeToRealActivateMs,
        }
        if (devicePreActiveAlarms[alarm_config_id]) {
            return;
        }
        devicePreActiveAlarms[alarm_config_id] = preActiveAlarmItem;
        this.preDeviceActiveAlarmsMap.set(device_id, devicePreActiveAlarms);
        this.logger.warn(
            `(addToPreActiveAlarms) alarm with alarm_config_id="${alarm_config_id}" has been added to pre-active alarms for device_id=${device_id}`
        );
    }

    removeFromPreActiveAlarmsIfExist(device_id: number, alarm_config_id: number): void {
        const devicePreActiveAlarms = this.preDeviceActiveAlarmsMap.get(device_id);
        if (!devicePreActiveAlarms) {
            return;
        }
        if (!devicePreActiveAlarms[alarm_config_id]) {
            return;
        }
        delete devicePreActiveAlarms[alarm_config_id];
        this.preDeviceActiveAlarmsMap.set(device_id, devicePreActiveAlarms);
        this.logger.warn(
            `(removeFromPreActiveAlarmsIfExist) alarm with alarm_config_id="${alarm_config_id}" has been removed from pre-active alarms for device_id=${device_id}`
        );
    }

    getPreActiveAlarmIfExist(device_id: number, alarm_config_id: number): PreActiveAlarmItemType | undefined {
        const devicePreActiveAlarms = this.preDeviceActiveAlarmsMap.get(device_id);
        if (!devicePreActiveAlarms) {
            return undefined;
        }
        return devicePreActiveAlarms[alarm_config_id];
    }

    public getAllPreActiveAlarms(): PreActiveAlarmItemType[] {
        const preAlarmMapItems = this.preDeviceActiveAlarmsMap.values();
        const preAlarmList: PreActiveAlarmItemType[] = [];
        for (const item of preAlarmMapItems) {
            const preDeviceAlarms = Object.values(item);
            preAlarmList.push(...preDeviceAlarms);
        }
        return preAlarmList;
    }

}