import { Inject, Logger, LoggerService } from "@nestjs/common";
import { AlarmFinishedAlarmAwaitConfirmation } from "#entities/alarm_finished_alarm_await_confirmation.entity";
import { AlarmFinishedAlarms } from "#entities/alarm_finished_alarms.entity";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { M500Service } from "#modules/postgres/m500.service";
import { AlarmFinishedAlarmsAwaitConfirmationCacheItemType } from "#cache/alarm-finished-alarms/types/AlarmFinishedAlarmsAwaitConfirmationCacheItem.type";
import { AlarmFinishedAlarmsCacheItemType } from "#cache/alarm-finished-alarms/types/AlarmFinishedAlarmsCacheItem.type";
import { schedule } from 'node-cron';
import { SystemConfigService } from "#modules/system-config/system-config.service";
import { AlarmActiveAlarms } from "#entities/alarm_active_alarms.entity";
import { AlarmFinishReasonEnum } from "#constants/AlarmFinishReason.enum";
import { PreparedAlarmConfigurationType } from "../alarm-configuration/types/PreparedAlarmConfiguration.type";
import { AlarmFinishedAlarmsDTO } from "#/dto/AlarmFinishedAlarms.dto";
import { AlarmFinishedAlarmAwaitConfirmationDTO } from "#/dto/AlarmFinishedAlarmAwaitConfirmation.dto";
import { PreDeviceFinishedAlarmsMapItemType } from "./types/PreDeviceFinishedAlarmsMapItem.type";
import { PreFinishedAlarmItemType } from "./types/PreFinishedAlarmItem.type";
import { AlarmActiveAlarmsWithAliasItemType } from "#modules/postgres/types/AlarmActiveAlarmsWithAliasItem.type";
import { EntityManager } from "typeorm";
export class AlarmFinishedAlarmsCacheService {

    private finishedAlarmsCache = new Map<number, AlarmFinishedAlarmsCacheItemType>();
    private finishedAlarmsAwaitConfirmationCache = new Map<number, AlarmFinishedAlarmsAwaitConfirmationCacheItemType>();
    private preDeviceFinishedAlarmsMap = new Map<number, PreDeviceFinishedAlarmsMapItemType>();

    private firstCacheIsInited = false;

    constructor(
        private readonly m500Service: M500Service,
        private readonly systemConfig: SystemConfigService,
        @Inject(Logger) readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, AlarmFinishedAlarmsCacheService.name);
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
        this.firstCacheIsInited = true;
    }

    private async initCache(): Promise<void> {
        try {
            const lastFinishedAlarms = await this.m500Service.getLastAlarmFinishedAlarms();
            const allFinishedAlarmsAwaitConfirmation = await this.m500Service.getAlarmFinishedAlarmsAwaitConfirmation();

            this.finishedAlarmsAwaitConfirmationCache = this.createCache(allFinishedAlarmsAwaitConfirmation);
            this.finishedAlarmsCache = this.createCache(lastFinishedAlarms);
        } catch (e) {
            this.logger.error(e);
        }
    }

    private createCache(
        newItems: AlarmFinishedAlarms[] | AlarmFinishedAlarmAwaitConfirmation[]
    ): Map<number, AlarmFinishedAlarmsCacheItemType> | Map<number, AlarmFinishedAlarmsAwaitConfirmationCacheItemType> {
        const newCache = new Map<number, any>();
        for (const item of newItems) {

            const cacheItem = newCache.get(item.device_id) ?? {};
            cacheItem[item.alarm_config_id] = cacheItem[item.alarm_config_id] ?
                cacheItem[item.alarm_config_id].push(item)
                : [item];

            newCache.set(item.device_id, cacheItem);
        }

        return newCache;
    }


    // возвращает все завершенные алармы по устройству
    public getAllFinishedAlarmByDeviceId(device_id: number): AlarmFinishedAlarmsCacheItemType | undefined {
        return this.finishedAlarmsCache.get(device_id);
    }

    // возвращает все завершенные, ожидающие квитирования, алармы по устройству
    public getAllFinishedAlarmAwaitConfirmationByDeviceId(device_id: number): AlarmFinishedAlarmsAwaitConfirmationCacheItemType | undefined {
        return this.finishedAlarmsAwaitConfirmationCache.get(device_id);
    }

    // возвращает завершенные, ожидающие квитирования, алармы по id устройства, id конфигурации и alarm_activation_guid
    // но возвращает максимум последний из таблицы завершенных и все те, что завершил за жизненный цикл сервиса
    // ??? возможно стоит переделать
    public getFinishedAlarmsAwaitConfirmationByDeviceIdAlarmConfigIdGUID(
        device_id: number,
        alarm_config_id: number,
        guid: string
    ): AlarmFinishedAlarmAwaitConfirmation[] {
        const deviceAlarms = this.finishedAlarmsAwaitConfirmationCache.get(device_id);
        if (!deviceAlarms) {
            return [];
        }
        const deviceAlarmsByConfigId = deviceAlarms[alarm_config_id];
        if (!deviceAlarmsByConfigId) {
            return [];
        }
        const guidAlarms = deviceAlarms[alarm_config_id].filter(x => x.alarm_activation_guid === guid);
        return guidAlarms;
    }

    // возвращает завершенные алармы по id устройства, id конфигурации и alarm_activation_guid
    // но возвращает максимум последний из таблицы завершенных и все те, что завершил за жизненный цикл сервиса
    // ??? возможно стоит переделать 
    public getFinishedAlarmsByDeviceIdAlarmConfigIdGUID(
        device_id: number,
        alarm_config_id: number,
        guid: string
    ): AlarmFinishedAlarms | undefined {
        const deviceAlarms = this.finishedAlarmsCache.get(device_id);
        if (!deviceAlarms) {
            return undefined;
        }
        const deviceAlarmsByConfigId = deviceAlarms[alarm_config_id];
        if (!deviceAlarmsByConfigId) {
            return undefined;
        }
        const guidAlarms = deviceAlarms[alarm_config_id].find(x => x.alarm_activation_guid === guid);
        return guidAlarms;
    }

    public async addToRealFinished(
        alarmInfo: AlarmActiveAlarmsWithAliasItemType,
        alarmConfig: PreparedAlarmConfigurationType | undefined,
        finish_reason: AlarmFinishReasonEnum,
    ): Promise<void> {
        try {
            const finishedAlarmAlreadyExist = this.checkAlarmOnExistInFinished(alarmInfo.device_id, alarmInfo);
            if (finishedAlarmAlreadyExist) {
                return;
            }
            // проверяем квитировали ли уже аларм
            const isConfirmed = alarmConfig?.finish_without_acknowledgement === false ?
                await this.checkOnAlarmConfirm(alarmInfo.alarm_activation_guid) :
                true;
            // если конфигурация есть, и по ней пользователь должен квитировать аварию 
            if (alarmConfig && alarmConfig.finish_without_acknowledgement === false && isConfirmed === false) {
                const finishedInfo = this.prepareDataToFinish(alarmInfo, finish_reason) as AlarmFinishedAlarmAwaitConfirmationDTO;
                // то добавляем запись в таблицу завершенных, ожидающих квитирования
                await this.m500Service.addAlarmToFinishedAlarmsAwaitConfirmation(finishedInfo);
                // и добавляем запись в кэш завершенных ожидающих квитирования
                this.addToAlarmFinishedAlarmsAwaitConfirmationCache(alarmInfo.device_id, finishedInfo);
                this.logger.warn(
                    `(addToRealFinished) THE ALARM with alarm_activation_guid="${alarmInfo.alarm_activation_guid}", alarm_config_id="${alarmConfig?.alarm_config_id}" HAS BEEN FINISHED INTO alarm_finished_alarm_await_confirmation FOR device_id=${alarmInfo.device_id} cause ${finish_reason}`
                );
            } else {
                // если конфигурация есть, и по ней пользователь должен квитировать аварию
                const finishedInfo = this.prepareDataToFinish(alarmInfo, finish_reason) as AlarmFinishedAlarmsDTO;
                // добавляем запись в таблицу завершенных алармов
                await this.m500Service.addAlarmToFinishedAlarms(finishedInfo);
                // добавляем в кэш завершенных алармов
                this.addToAlarmFinishedAlarmsCache(alarmInfo.device_id, finishedInfo);
                this.logger.warn(
                    `(addToRealFinished) THE ALARM with alarm_activation_guid="${alarmInfo.alarm_activation_guid}", alarm_config_id="${alarmConfig?.alarm_config_id}" HAS BEEN FINISHED INTO alarm_finished_alarms FOR device_id=${alarmInfo.device_id} cause ${finish_reason}`
                );
            }
        } catch (e) {
            this.logger.error(
                `(addToRealFinished) ERROR while adding to real finished alarms for alarm_config_id="${alarmInfo?.alarm_config_id}" device_id="${alarmInfo?.device_id}" alias="${alarmInfo?.alias}" and alarm_activation_guid=${alarmInfo?.alarm_activation_guid}`
            )
            this.logger.error(e);
            throw e;
        }
    }

    // добавляе в завершенные алармы в зависимости от конфигурации аларма 
    public async addToRealFinishedWithTransaction(
        alarmInfo: AlarmActiveAlarmsWithAliasItemType,
        alarmConfig: PreparedAlarmConfigurationType | undefined,
        finish_reason: AlarmFinishReasonEnum,
    ): Promise<void> {
        try {
            const finishedAlarmAlreadyExist = this.checkAlarmOnExistInFinished(alarmInfo.device_id, alarmInfo);
            if (finishedAlarmAlreadyExist) {
                return;
            }
            // проверяем квитировали ли уже аларм
            const isConfirmed = alarmConfig?.finish_without_acknowledgement === false ?
                await this.checkOnAlarmConfirm(alarmInfo.alarm_activation_guid) :
                true;
            // если конфигурация есть, и по ней пользователь должен квитировать аварию 
            if (alarmConfig && alarmConfig.finish_without_acknowledgement === false && isConfirmed === false) {
                const finishedInfo = this.prepareDataToFinish(alarmInfo, finish_reason) as AlarmFinishedAlarmAwaitConfirmationDTO;
                // то добавляем запись в таблицу завершенных, ожидающих квитирования
                await this.m500Service.addAlarmToFinishedAlarmsAwaitConfirmationWithTransaction(finishedInfo);
                // и добавляем запись в кэш завершенных ожидающих квитирования
                this.addToAlarmFinishedAlarmsAwaitConfirmationCache(alarmInfo.device_id, finishedInfo);
                this.logger.warn(
                    `(addToRealFinishedWithTransaction) THE ALARM with alarm_activation_guid="${alarmInfo.alarm_activation_guid}", alarm_config_id="${alarmConfig?.alarm_config_id}" HAS BEEN REMOVED FROM ACTIVE ALARMS AND FINISHED INTO alarm_finished_alarm_await_confirmation FOR device_id=${alarmInfo.device_id} cause ${finish_reason}`
                );
            } else {
                // если конфигурация есть, и по ней пользователь должен квитировать аварию
                const finishedInfo = this.prepareDataToFinish(alarmInfo, finish_reason) as AlarmFinishedAlarmsDTO;
                // добавляем запись в таблицу завершенных алармов
                await this.m500Service.addAlarmToFinishedAlarmsWithTransaction(finishedInfo);
                // добавляем в кэш завершенных алармов
                this.addToAlarmFinishedAlarmsCache(alarmInfo.device_id, finishedInfo);
                this.logger.warn(
                    `(addToRealFinishedWithTransaction) THE ALARM with alarm_activation_guid="${alarmInfo.alarm_activation_guid}", alarm_config_id="${alarmConfig?.alarm_config_id}" HAS BEEN REMOVED FROM ACTIVE ALARMS AND FINISHED INTO alarm_finished_alarms FOR device_id=${alarmInfo.device_id} cause ${finish_reason}`
                );
            }
        } catch (e) {
            this.logger.error(
                `(addToRealFinishedWithTransaction) ERROR while adding to real finished alarms for alarm_config_id="${alarmInfo?.alarm_config_id}" device_id="${alarmInfo?.device_id}" alias="${alarmInfo?.alias}" and alarm_activation_guid=${alarmInfo?.alarm_activation_guid}`
            )
            this.logger.error(e);
            throw e;
        }
    }

    async checkOnAlarmConfirm(alarm_activation_guid: string) {
        const confirmedAlarm = await this.m500Service.getUserAlarmConfirmItemByAlarmActivationGUID(alarm_activation_guid);
        const isConfirmed = !!confirmedAlarm;
        return isConfirmed
    }

    checkAlarmOnExistInFinished(device_id: number, alarmInfo: AlarmActiveAlarms): boolean {
        const { alarm_config_id, alarm_activation_guid } = alarmInfo;
        const finishedAlarm = this.getFinishedAlarmsByDeviceIdAlarmConfigIdGUID(
            device_id, alarm_config_id, alarm_activation_guid
        );
        const finishedAlarmAwaitConfirmation = this.getFinishedAlarmsAwaitConfirmationByDeviceIdAlarmConfigIdGUID(
            device_id, alarm_config_id, alarm_activation_guid
        );
        if (finishedAlarm) {
            return false;
        }
        if (finishedAlarmAwaitConfirmation) {
            return false;
        }
        return true;
    }


    // метод подготовки данных к завершению активного аларма
    private prepareDataToFinish(
        alarm: AlarmActiveAlarms,
        finish_reason: AlarmFinishReasonEnum
    ): AlarmFinishedAlarmAwaitConfirmationDTO | AlarmFinishedAlarmsDTO {
        const finishedInfo = {
            alarm_activation_guid: alarm.alarm_activation_guid,
            alarm_config_id: alarm.alarm_config_id,
            device_id: alarm.device_id,
            activation_value: alarm.activation_value,
            dt_start: alarm.dt_start,
            debug_info: alarm.debug_info,
            dt_end: new Date().toISOString(),
            finish_reason: finish_reason,
        };
        return finishedInfo;
    }

    addToAlarmFinishedAlarmsAwaitConfirmationCache(
        device_id: number,
        finishedInfo: AlarmFinishedAlarmAwaitConfirmationDTO
    ): void {
        try {
            const deviceFinishedAlarms = this.getAllFinishedAlarmAwaitConfirmationByDeviceId(device_id)
                ?? {} as AlarmFinishedAlarmsAwaitConfirmationCacheItemType;

            const configFinishedAlarms = deviceFinishedAlarms[finishedInfo.alarm_config_id] ?? [];
            configFinishedAlarms.push(finishedInfo);
            deviceFinishedAlarms[finishedInfo.alarm_config_id] = configFinishedAlarms;
            this.finishedAlarmsAwaitConfirmationCache.set(device_id, deviceFinishedAlarms);
        } catch (e) {
            this.logger.error(e);
        }
    }

    async addToAlarmFinishedAlarmsCache(
        device_id: number,
        finishedInfo: AlarmFinishedAlarmsDTO
    ): Promise<void> {
        try {
            const deviceFinishedAlarms = this.getAllFinishedAlarmByDeviceId(device_id)
                ?? {} as AlarmFinishedAlarmsCacheItemType;

            const configFinishedAlarms = deviceFinishedAlarms[finishedInfo.alarm_config_id] ?? [];
            configFinishedAlarms.push(finishedInfo);
            deviceFinishedAlarms[finishedInfo.alarm_config_id] = configFinishedAlarms;
            this.finishedAlarmsCache.set(device_id, deviceFinishedAlarms);
        } catch (e) {
            this.logger.error(e);
        }
    }

    /*
     * ОТЛОЖЕННЫЕ АЛАРМЫ (Пред-завершенные)
    */

    addToPreFinishedAlarms(
        device_id: number,
        alarm_config_id: number,
        alias: string,
        valkeyKey: string,
        timeToRealFinishMs: number,
    ): void {
        const devicePreFinishedAlarms = this.preDeviceFinishedAlarmsMap.get(device_id) ?? {};

        const preFinishedAlarmItem = {
            fixedAt: new Date().valueOf(),
            device_id: device_id,
            alarm_config_id: alarm_config_id,
            alias: alias,
            valkeyKey,
            timeToRealFinishMs
        }

        // если пред-завершение уже есть по этой конфигурации, то ничего не делаем
        if (devicePreFinishedAlarms[alarm_config_id]) {
            return;
        }

        devicePreFinishedAlarms[alarm_config_id] = preFinishedAlarmItem;
        this.preDeviceFinishedAlarmsMap.set(device_id, devicePreFinishedAlarms);
        this.logger.warn(
            `(addToPreFinishedAlarms) alarm with alarm_config_id="${alarm_config_id}" has been added to pre-finished alarms for device_id=${device_id}`
        );
    }

    // удаляем аларм по id устройства и id конфигурации из пред-завершенных алармов
    removeFromPreFinishedAlarmsIfExist(device_id: number, alarm_config_id: number): void {
        const devicePreActiveAlarms = this.preDeviceFinishedAlarmsMap.get(device_id);
        // если ни одной записи по устройству нет, то ничего не делаем
        if (!devicePreActiveAlarms) {
            return;
        }
        // если записи уже нет, то ничего не делаем
        if (!devicePreActiveAlarms[alarm_config_id]) {
            return;
        }
        delete devicePreActiveAlarms[alarm_config_id];
        this.preDeviceFinishedAlarmsMap.set(device_id, devicePreActiveAlarms);
        this.logger.warn(
            `(removeFromPreFinishedAlarmsIfExist) alarm with alarm_config_id="${alarm_config_id}" has been removed from pre-finished alarms for device_id=${device_id}`
        );
    }

    // получаем пред-завершенный аларм по id конфигурации и id устройства
    getPreFinishedAlarmIfExist(device_id: number, alarm_config_id: number): PreFinishedAlarmItemType | undefined {
        const devicePreActiveAlarms = this.preDeviceFinishedAlarmsMap.get(device_id);
        if (!devicePreActiveAlarms) {
            return undefined;
        }
        return devicePreActiveAlarms[alarm_config_id];
    }

    // получаем все записи пред-завершенных алармов
    public getAllPreFinishedAlarms(): PreFinishedAlarmItemType[] {
        const preAlarmMapItems = this.preDeviceFinishedAlarmsMap.values();
        const preAlarmList: PreFinishedAlarmItemType[] = [];
        for (const item of preAlarmMapItems) {
            const preDeviceAlarms = Object.values(item);
            preAlarmList.push(...preDeviceAlarms);
        }
        return preAlarmList;
    }
}