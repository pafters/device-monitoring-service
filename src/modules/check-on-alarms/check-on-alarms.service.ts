import { AlarmFinishReasonEnum } from "#constants/AlarmFinishReason.enum";
import { checkOnConditionValue } from "#helpers/checkOnConditionValue.helper";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { AlarmActiveAlarmsCacheService } from "#modules/cache/alarm-active-alarms/alarm-active-alarms.cache.service";
import { AlarmConfigurationCacheService } from "#modules/cache/alarm-configuration/alarm-configuration.cache.service";
import { AlarmFinishedAlarmsCacheService } from "#modules/cache/alarm-finished-alarms/alarm-finished-alarms.cache.service";
import { DeviceAliasConfigurationMatchBindsCacheService } from "#modules/cache/device-alias-configuration-match-binds/device-alias-configuration-match-binds.cache.service";
import { DeviceLocationsSiteBindsCacheService } from "#modules/cache/device-locations-site-binds/device-locations-site-binds.cache.service";
import { DeviceModemBindsCacheService } from "#modules/cache/device-modem-binds/device-modem-binds.cache.service";
import { AlarmActiveAlarmsWithAliasItemType } from "#modules/postgres/types/AlarmActiveAlarmsWithAliasItem.type";
import { ValkeyService } from "#modules/valkey/valkey.service";
import { Inject, Logger, LoggerService } from "@nestjs/common";
import { DeviceModemInfoType } from "./types/DeviceModemInfo.type";
import { PreparedAlarmConfigurationType } from "#modules/cache/alarm-configuration/types/PreparedAlarmConfiguration.type";
import { LiveHadledValueType } from "#/types/LiveHadledValue.type";
import { PreparedDataForCheckOnAlarmByValkeyKeyItemType } from "./types/PreparedDataForCheckOnAlarmByValkeyKeyItem.type";
import { ValkeyItemWithHandledValueType } from "#modules/valkey/types/ValkeyItemWithValue.type";

export class CheckOnAlarmsService {

    constructor(
        private readonly deviceModemBindsCacheService: DeviceModemBindsCacheService,
        private readonly deviceLocationsSiteBindsCacheService: DeviceLocationsSiteBindsCacheService,
        private readonly deviceAliasConfigurationMatchBindsCacheService: DeviceAliasConfigurationMatchBindsCacheService,
        private readonly alarmActiveAlarmsCacheService: AlarmActiveAlarmsCacheService,
        private readonly alarmConfigurationCacheService: AlarmConfigurationCacheService,
        private readonly valkeyService: ValkeyService,
        private readonly alarmFinishedAlarmsCacheService: AlarmFinishedAlarmsCacheService,
        @Inject(Logger) private readonly logger: LoggerService
    ) {
        this.logger = addContextDecoratorLogger(logger, CheckOnAlarmsService.name)
    }


    ///
    // *** НИЖЕ ВИДЫ ПРОВЕРОК ***
    ///

    // проверка на есть ли уже активный аларм или предактивный по этой конфигурации
    private checkAlarmConfigOnExistInActiveOrPreActiveAlarms(device_id: number, alarmConfigInfo: PreparedAlarmConfigurationType): boolean {
        // проверяем активен ли уже аларм по конфигурации на момент проверки,
        // если активен, то дальше не проводим проверку
        const existActiveAlarm = this.alarmActiveAlarmsCacheService.getActiveAlarmsByDeviceIdConfigId(device_id, alarmConfigInfo.alarm_config_id);

        if (existActiveAlarm !== undefined) {
            return true;
        }

        // проверяем существует ли уже предактивация аларма по этой конфигурации на момент проверки,
        // если существует, то дальше не проводим проверку 
        if (alarmConfigInfo.activation_condition_time_to_activate_ms) {
            const existPreActiveAlarm =
                this.alarmActiveAlarmsCacheService.getPreActiveAlarmIfExist(device_id, alarmConfigInfo.alarm_config_id);
            if (existPreActiveAlarm !== undefined) {
                return true;
            }
        }

        return false;
    }


    // ** NEW проверка показателей с датчика на активацию
    async checkValkeyDataOnAlarmActivationByAlarmConfig(
        deviceModemData: DeviceModemInfoType,
        alarmConfigInfo: PreparedAlarmConfigurationType,
        deviceAliasValkeyData: ValkeyItemWithHandledValueType,
        valkeyKey: string
    ): Promise<boolean> {
        try {
            // определяем подробную информацию по модему и устройству
            const { modemInfo, deviceInfo } = deviceModemData;

            // определяем запись из valkey и обработанное значение по датчику 
            const { liveData, value } = deviceAliasValkeyData;

            // проверяем на активацию по показателям с датчика
            const canFinishByFinishCondition = this.checkValueOnAlarmFinish(alarmConfigInfo, value);

            // проверяем на возможность неактивации аларма если условия завершения указаны в конфигурации
            // и по ним датчик считается неаварийным 
            if (
                alarmConfigInfo.finish_condition && alarmConfigInfo.finish_condition_value !== undefined
                && canFinishByFinishCondition === true
            ) {
                return false;
            }

            // проверяем на активацию по показателям с датчика
            const canActivateByActivationCondition = this.checkValueOnAlarmActivate(alarmConfigInfo, value);

            if (canActivateByActivationCondition === true) {
                // убрать пред-завершенные алармы
                this.alarmFinishedAlarmsCacheService.removeFromPreFinishedAlarmsIfExist(
                    deviceInfo.device_id,
                    alarmConfigInfo.alarm_config_id
                );

                // проверить есть ли уже активный или пред-активный аларм
                const activeOrPreActiveAlarmIsExist = this.checkAlarmConfigOnExistInActiveOrPreActiveAlarms(
                    deviceInfo.device_id,
                    alarmConfigInfo
                );

                if (activeOrPreActiveAlarmIsExist === true) {
                    return true;
                }
                // если активация возможна, то проверяем условия конфигурация на то, что требуется ли предактивация
                if (alarmConfigInfo.activation_condition_time_to_activate_ms) {
                    // если она требуется, то формируем предактивацию и больше ничего не делаем
                    this.alarmActiveAlarmsCacheService.addToPreActiveAlarmsIfIsNotExist(
                        deviceInfo.device_id,
                        alarmConfigInfo.alarm_config_id,
                        value,
                        alarmConfigInfo.alias,
                        valkeyKey,
                        alarmConfigInfo.activation_condition_time_to_activate_ms
                    );
                    return true;
                }
                await this.alarmActiveAlarmsCacheService.addToActiveAlarmsIfIsNotExist(
                    alarmConfigInfo,
                    deviceInfo,
                    modemInfo,
                    liveData,
                    value
                );
                return true;
            }
            return false;
        } catch (e) {
            this.logger.error(e);
            this.logger.error(
                `(checkDeviceOnAlarmActivation) ERROR while checking pre-active alarm on real checking for alias="${alarmConfigInfo?.alias}" device_id="${deviceModemData?.deviceInfo?.device_id}" and alarm_config_id="${alarmConfigInfo?.alarm_config_id}"`
            );
            throw e;
        }
    }

    // * NEW
    async checkValkeyDataOnAlarmFinishByAlarmConfig(
        deviceModemData: DeviceModemInfoType,
        alarmConfigInfo: PreparedAlarmConfigurationType,
        deviceAliasValkeyData: ValkeyItemWithHandledValueType,
        valkeyKey: string
    ): Promise<void> {
        // определяем подробную информацию по модему и устройству
        const { modemInfo, deviceInfo } = deviceModemData;

        // определяем запись из valkey и обработанное значение по датчику 
        const { liveData, value } = deviceAliasValkeyData;

        // если ее нет, то и нечего проверять дальше

        // проверяем на выполнение условий завершения
        const canFinishByFinishCondition = this.checkValueOnAlarmFinish(alarmConfigInfo, value);

        if (
            // если условия завершения не выполняются
            alarmConfigInfo.finish_condition
            && alarmConfigInfo.finish_condition_value !== undefined
            && canFinishByFinishCondition === false
        ) {
            // то мы не можем завершить или пред-завершить аварию, которая находится в аварийных показателях
            // и поэтому продолжаем отслеживать состояние по ней
            return;
        }

        if (
            // если в конфигурации описаны условия завершения аларма, и если по этим условиям 
            // авария может считаться завершенной 
            (
                alarmConfigInfo.finish_condition &&
                alarmConfigInfo.finish_condition_value !== undefined
                && canFinishByFinishCondition === true
            )
            // либо если они не описаны, то есть в конфигурации нет условия завершения аларма,
            //  а только указаны условия ее активации, 
            // то завершением считаем невыполнение условий активации
            || (
                !alarmConfigInfo.finish_condition ||
                alarmConfigInfo.finish_condition_value == undefined
            )
        ) {

            // если пред-активное состояние есть, то его можем завершить
            this.alarmActiveAlarmsCacheService.removeFromPreActiveAlarmsIfExist(
                deviceInfo.device_id,
                alarmConfigInfo.alarm_config_id
            );


            // проверяем есть ли активная авария
            const existActiveAlarm = this.alarmActiveAlarmsCacheService.getActiveAlarmsByDeviceIdConfigId(
                deviceInfo.device_id,
                alarmConfigInfo.alarm_config_id
            );

            // если активной аварии нет, то нечего больше завершать
            if (!existActiveAlarm) {
                return;
            }

            // проверяем на то, завершена ли уже эта авария
            const existFinishedAlarm =
                this.alarmFinishedAlarmsCacheService.getFinishedAlarmsByDeviceIdAlarmConfigIdGUID(
                    deviceInfo.device_id, alarmConfigInfo.alarm_config_id, existActiveAlarm.alarm_activation_guid
                );

            // если активный аларм уже находится в завершенных, то удаляем его только из активных аварий
            if (existFinishedAlarm) {
                await this.alarmActiveAlarmsCacheService.forceRemoveFromActiveAlarms(
                    deviceInfo.device_id,
                    alarmConfigInfo.alarm_config_id
                );
                return;
            }

            // то проверяем конфигурацию на то, следует ли выполнять предзавершение
            if (alarmConfigInfo.finish_condition_time_to_activate_ms) {
                // если нужно, то добавляем запись в предзавершения и больше ничего не делаем
                this.alarmFinishedAlarmsCacheService.addToPreFinishedAlarms(
                    deviceInfo.device_id,
                    alarmConfigInfo.alarm_config_id,
                    existActiveAlarm.alias,
                    valkeyKey,
                    alarmConfigInfo.finish_condition_time_to_activate_ms
                );

                return;
            }
            // если конфигурация говорит, что следует сразу полностью завершать активную аварию, то завершаем
            // и больше ничего не делаем
            await this.forceFinishActiveAlarm(existActiveAlarm, alarmConfigInfo, AlarmFinishReasonEnum.VALUE_IS_NORMAL);
            return;
        }
    }


    // ** NEW проверка активных аварий на возможность их завершения по причине что по кэшу данных они больше не могут быть активны
    // устройство удалено, связки с модемом больше нет, связка проверки на конфигурацию больше недействительна или попала в исключение
    // и т.п. 
    async checkActiveAlarmsOnCacheValidElseFinish(alarm: AlarmActiveAlarmsWithAliasItemType): Promise<void> {
        try {

            const { device_id, alarm_config_id, alarm_activation_guid } = alarm;

            // проверяем находится ли уже в завершенных проверяемый активный аларм 
            const existFinishedAlarm =
                this.alarmFinishedAlarmsCacheService.getFinishedAlarmsByDeviceIdAlarmConfigIdGUID(
                    device_id, alarm_config_id, alarm_activation_guid
                );

            // если активный аларм уже находится в завершенных, то удаляем его только из активных и пред-активных аварий
            if (existFinishedAlarm) {
                await this.alarmActiveAlarmsCacheService.deleteActiveAlarmsByDeviceIdAlarmConfigId(device_id, alarm_config_id);
                this.alarmActiveAlarmsCacheService.removeFromPreActiveAlarmsIfExist(device_id, alarm_config_id);
                return;
            }

            // дальше идет проверка, если активный аларм еще не находится в завершенных

            // получаем подробную информацию по проверяемой конфигурации
            const alarmConfigInfo = this.alarmConfigurationCacheService.getConfigByConfigId(alarm_config_id);

            // если мы не находим конфигурацию
            if (!alarmConfigInfo) {
                // то полностью завершаем активный аларм даже если на момент активации аларма конфигурация просила предзавершения
                await this.forceFinishActiveAlarm(
                    alarm,
                    alarmConfigInfo,
                    AlarmFinishReasonEnum.ALARM_CONFIGURATION_CHANGED
                );
                return;
            }

            // проверяем конфигурацию на то, есть ли у нее условия на предзавершения
            if (alarmConfigInfo?.finish_condition_time_to_activate_ms) {
                // если условия предзавершения есть, то проверяем есть ли активный аларм уже в предзавершенных
                const existPreFinishedAlarm =
                    this.alarmFinishedAlarmsCacheService.getPreFinishedAlarmIfExist(device_id, alarm_config_id);
                if (existPreFinishedAlarm) {
                    // если в предзавершенных алармах уже есть этот активный аларм, то ничего больше не делаем
                    return;
                }
            }

            // проверяем, есть ли конфигурация в списке подлежащих проверки для этого устройства и параметра
            const configShouldBeChecked =
                this.checkAlarmConfigurationOnExistInDeviceAliasConfigMatchList(alarm.alarm_config_id, device_id, alarm.alias);


            // если конфигурации нет в списке подлежащих проверки, то завершаем активный аларм
            // даже если конфигурация на момент активации требовала предзавершения
            if (configShouldBeChecked === false) {
                await this.forceFinishActiveAlarm(alarm, alarmConfigInfo, AlarmFinishReasonEnum.DEVICE_NO_LONGER_BIND_TO_ALARM);
                return;
            }

            // дальше проводим проверку на завершение, зная, что у нас нет записи по этому аларму ни в последних завершенных,
            //  ни в предзавершениях


            // получаем связку устройство + модем
            const deviceModemData = this.getDeviceModemData(device_id);

            // если связки устройство + модем не существует
            if (!deviceModemData) {
                // то полностью завершаем даже если конфигурация просит предзавершения
                // и дальше не проводим никакие проверки
                await this.forceFinishActiveAlarm(
                    alarm,
                    alarmConfigInfo,
                    AlarmFinishReasonEnum.INVALID_MODEM_DEVICE_BIND
                );
                return;
            }

            return;

        } catch (e) {
            this.logger.error(
                `(checkActiveAlarmOnFinish) ERROR while checking alarm on finish for alias="${alarm?.alias}" device_id="${alarm?.device_id}" and alarm_config_id="${alarm?.alarm_config_id}"`
            );
            this.logger.error(e);
        }
    }


    // * NEW Проверка пред-активных аварий на полноценную активацию
    async checkPreActiveAlarmOnRealActivation(device_id: number, alarm_config_id: number, valkeyKey: string, alias: string) {
        try {
            // определяем конфигурацию, по которому прошла отложенная активация
            const alarmConfigInfo = this.alarmConfigurationCacheService.getConfigByConfigId(alarm_config_id);

            // если мы не находим конфигурацию
            if (!alarmConfigInfo) {
                this.logger.warn(
                    `(checkPreActiveAlarmOnRealActivation) alarm configuration with alarm_config_id="${alarm_config_id}" does not exist anymore`
                );
                return;
            }

            // проверяем есть ли уже активный аларм по этому устройству и конфигурации
            const existActiveAlarm = this.alarmActiveAlarmsCacheService.getActiveAlarmsByDeviceIdConfigId(device_id, alarm_config_id);

            // если есть, то ничего не делаем больше и считаем пред-активацию недействительной
            if (existActiveAlarm !== undefined) {
                this.logger.warn(
                    `(checkPreActiveAlarmOnRealActivation) The active alarm that could be pre-activated already exist`
                );
                return;
            }

            // если параметр, по которому проводилась пред-активация отличается от того, что в конфигурации
            // считаем, что конфигурацию поменяли, а эту пред-активацию считаем недействительной
            if (alarmConfigInfo.alias !== alias) {
                this.logger.warn(
                    `(checkPreActiveAlarmOnRealActivation) alarm configuration with alarm_config_id="${alarm_config_id}" for pre-actvating alarm have been changed on new alias="${alarmConfigInfo.alias}" (old alias="${alias}")`
                );
                return;
            }

            // проверяем, есть ли конфигурация в списке подлежащих проверки для этого устройства и параметра
            const configShouldBeChecked =
                this.checkAlarmConfigurationOnExistInDeviceAliasConfigMatchList(alarm_config_id, device_id, alias);

            if (configShouldBeChecked === false) {

                this.logger.warn(
                    `(checkPreActiveAlarmOnRealActivation) The configuration with alarm_config_id="${alarm_config_id}" is no longer on the match-list to be checked for device_id="${device_id}"`
                );
                return;
            }
            // получаем связку устройство + модем
            const deviceModemData = this.getDeviceModemData(device_id);
            if (!deviceModemData) {
                this.logger.warn(`(checkPreActiveAlarmOnRealActivation) device or modem data not found for device_id="${device_id}"`);
                return;
            }

            // получаем данные по пришедшему по устройству параметру 
            const deviceAliasValkeyData = await this.valkeyService.getLiveDataWithHandledValueByValkeyKey(valkeyKey);
            if (deviceAliasValkeyData === undefined) {
                this.logger.error(`(checkPreActiveAlarmOnRealActivation) valkeyData for key "${valkeyKey}" and device_id="${device_id}" not found`);
                return;
            }

            // проверяем на выполнение условий завершения
            const canFinishByFinishCondition = this.checkValueOnAlarmFinish(alarmConfigInfo, deviceAliasValkeyData.value);

            // если в конфигурации описаны условия завершения аларма, и если по этим условиям 
            // авария соответствует значениям нормы, то пред-активацию считаем недействительной
            if (
                alarmConfigInfo.finish_condition &&
                alarmConfigInfo.finish_condition_value !== undefined
                && canFinishByFinishCondition === true
            ) {
                return;
            }

            // проверяем до сих пор ли датчик в аварийных значениях
            const canActivateByActivationCondition = this.checkValueOnAlarmActivate(alarmConfigInfo, deviceAliasValkeyData.value);

            // если датчик больше не находится в аварийных значениях, то пред-активация больше недействительна
            if (canActivateByActivationCondition === false) {
                return;
            }

            const { deviceInfo, modemInfo } = deviceModemData

            // если все входящие данные впорядке, то формируем полноценную активацию
            await this.alarmActiveAlarmsCacheService.addToActiveAlarmsIfIsNotExist(
                alarmConfigInfo,
                deviceInfo,
                modemInfo,
                deviceAliasValkeyData.liveData,
                deviceAliasValkeyData.value
            );
        } catch (e) {
            this.logger.error(
                `(checkPreActiveAlarmOnRealActivation) ERROR while checking pre-active alarm on real activation for device_id="${device_id}" alarm_config_id="${alarm_config_id}" and alias="${alias}"`
            );
            this.logger.error(e);
        }
    }


    // * NEW Проверка пред-завершенных аварий на полноценную активацию
    async checkPreFinishedAlarmOnRealFinish(device_id: number, alarm_config_id: number, valkeyKey: string, alias: string) {
        try {
            // проверяем есть ли уже активный аларм по этому устройству и конфигурации
            const existActiveAlarm = this.alarmActiveAlarmsCacheService.getActiveAlarmsByDeviceIdConfigId(device_id, alarm_config_id);

            // если есть, то ничего не делаем больше и считаем пред-завершение недействительной
            if (existActiveAlarm === undefined) {
                this.logger.warn(
                    `(checkPreFinishedAlarmOnRealFinish) The active alarm that could be pre-finished does not exist anymore`
                );
                return;
            }

            // проверяем находится ли уже в завершенных проверяемый активный аларм 
            const existFinishedAlarm =
                this.alarmFinishedAlarmsCacheService.getFinishedAlarmsByDeviceIdAlarmConfigIdGUID(
                    device_id, alarm_config_id, existActiveAlarm.alarm_activation_guid
                );

            // если активный аларм уже находится в завершенных, то удаляем его только из активных аварий
            if (existFinishedAlarm) {
                await this.alarmActiveAlarmsCacheService.deleteActiveAlarmsByDeviceIdAlarmConfigId(device_id, alarm_config_id);
                return;
            }

            const alarmConfigInfo = this.alarmConfigurationCacheService.getConfigByConfigId(alarm_config_id);

            // если мы не находим конфигурацию, то пред-завершение больше недействительно
            if (!alarmConfigInfo) {
                this.logger.warn(
                    `(checkPreFinishedAlarmOnRealFinish) alarm configuration with alarm_config_id="${alarm_config_id}" does not exist anymore`
                );
                return;
            }

            // если параметр, по которому проводилось пред-завершение отличается от того, что в конфигурации
            // считаем, что конфигурацию поменяли, а это пред-завершение считаем недействительным
            if (alarmConfigInfo.alias !== alias) {
                this.logger.warn(
                    `(checkPreFinishedAlarmOnRealFinish) alarm configuration with alarm_config_id="${alarm_config_id}" for pre-finished alarm have been changed on new alias="${alarmConfigInfo.alias}" (old alias="${alias}")`
                );
                return;
            }

            // проверяем, есть ли конфигурация в списке подлежащих проверки для этого устройства и параметра
            const configShouldBeChecked =
                this.checkAlarmConfigurationOnExistInDeviceAliasConfigMatchList(alarm_config_id, device_id, alias);

            // если конфигурации в списках подлежащих проверки больше нет, то пред-завершение больше недействительно
            if (configShouldBeChecked === false) {
                this.logger.warn(
                    `(checkPreFinishedAlarmOnRealFinish) The configuration with alarm_config_id="${alarm_config_id}" is no longer on the match-list to be checked for device_id="${device_id}"`
                );
                return;
            }
            // получаем связку устройство + модем
            const deviceModemData = this.getDeviceModemData(device_id);

            if (!deviceModemData) {
                this.logger.warn(`(checkPreFinishedAlarmOnRealFinish) device or modem data not found for device_id="${device_id}"`);
                return;
            }

            // получаем данные по пришедшему по устройству параметру 
            const deviceAliasValkeyData = await this.valkeyService.getLiveDataWithHandledValueByValkeyKey(valkeyKey);

            if (deviceAliasValkeyData === undefined) {
                this.logger.error(`(checkPreFinishedAlarmOnRealFinish) valkeyData for key "${valkeyKey}" and device_id="${device_id}" not found`);
                return;
            }

            // проверяем на завершение по показателям с датчика
            const canFinishByFinishCondition = this.checkValueOnAlarmFinish(alarmConfigInfo, deviceAliasValkeyData.value);

            // проверяем на возможность неактивации аларма если условия завершения указаны в конфигурации
            // и по ним датчик считается неаварийным 
            if (
                alarmConfigInfo.finish_condition && alarmConfigInfo.finish_condition_value !== undefined
                && canFinishByFinishCondition === true
            ) {
                await this.forceFinishActiveAlarm(existActiveAlarm, alarmConfigInfo, AlarmFinishReasonEnum.VALUE_IS_NORMAL);
                return;
            }

            // проверяем до сих пор ли датчик в аварийных значениях
            const canActivateByActivationCondition = this.checkValueOnAlarmActivate(alarmConfigInfo, deviceAliasValkeyData.value);
            // если датчик находится в аварийных значениях, то пред-завершение больше недействительно
            // так как аварийность из-за отсутствия датчика сохраняется

            if (canActivateByActivationCondition === true) {
                return;
            }

            if (canActivateByActivationCondition === false) {
                this.logger.warn(`(checkPreFinishedAlarmOnRealFinish) CALLED FORCE FINISH for device_id=${device_id} alarm_config_id="${alarm_config_id}"`);
                await this.forceFinishActiveAlarm(existActiveAlarm, alarmConfigInfo, AlarmFinishReasonEnum.VALUE_IS_NORMAL);
            }

        } catch (e) {
            this.logger.error(
                `(checkPreActiveAlarmOnRealActivation) ERROR while checking pre-active alarm on real activation for device_id="${device_id}" alarm_config_id="${alarm_config_id}" and alias="${alias}"`
            );
            this.logger.error(e);
        }
    }


    /// *********
    // *** НИЖЕ ОДНИ ИЗ СПОСОБОВ ЗАВЕРШЕНИЯ АКТИВНЫХ АЛАРМОВ 
    /// *********


    // принудительное завершения без формирования предзавершения
    async forceFinishActiveAlarm(
        alarm: AlarmActiveAlarmsWithAliasItemType,
        alarmConfigInfo: PreparedAlarmConfigurationType | undefined,
        finishReason: AlarmFinishReasonEnum
    ): Promise<void> {
        try {
            this.logger.log('TRANSACTION STARTED');
            this.alarmFinishedAlarmsCacheService.removeFromPreFinishedAlarmsIfExist(alarm.device_id, alarm.alarm_config_id);
            this.alarmActiveAlarmsCacheService.removeFromPreActiveAlarmsIfExist(alarm.device_id, alarm.alarm_config_id);

            await this.alarmFinishedAlarmsCacheService.addToRealFinishedWithTransaction(
                alarm,
                alarmConfigInfo,
                finishReason
            );
            this.alarmActiveAlarmsCacheService.removeFromActiveAlarmsCache(alarm.device_id, alarm.alarm_config_id);
        } catch (e) {
            this.logger.error(
                `(forceFinishActiveAlarm) ERROR while processing EXTRA FINISH for alarm.alarm_activation_guid="${alarm.alarm_activation_guid}" device_id="${alarm.device_id}" and alarm_config_id="${alarm.alarm_config_id}"`
            );
            this.logger.error(e);
        }
    }




    /// **********
    // *** НИЖЕ ВНУТРЕННИЕ ПОЛЕЗНОСТИ, ПОМОГАЮЩИЕ СЕРВИСУ В ПРОВЕРКАХ ***
    // ***********

    // определяет каким id устройствам/устройству и алиасу принадлежит пришедший valkey ключ из подписки
    public prepareDataToCheckOnAlarmsByValkeyKey(key: string): PreparedDataForCheckOnAlarmByValkeyKeyItemType | undefined {
        try {
            const device_ids: number[] = [];
            const keyInfo = key.split('/');

            const [typeObject, objectId, alias] = keyInfo;

            if (typeObject !== 'modem' && typeObject !== 'device') {
                return;
            }

            const numericObjectId = Number(objectId)

            if (objectId === null || objectId === undefined || isNaN(numericObjectId)) {
                this.logger.error(
                    `(prepareDataToCheckOnAlarmsByValkeyKey) column ${typeObject}_id="${objectId}" is not valid for key "${key}"`
                );
                return;
            }

            if (!alias) {
                this.logger.error(
                    `(prepareDataToCheckOnAlarmsByValkeyKey) column alias="${alias}" is not valid for key "${key}"`
                );
                return;
            }


            if (typeObject === 'modem') {
                const deviceIdsWithThisModem = this.deviceModemBindsCacheService.getDeviceIdsByModemId(numericObjectId);
                device_ids.push(...deviceIdsWithThisModem);
            } else if (typeObject === 'device') {
                const modemInfo = this.deviceModemBindsCacheService.getModemInfoByDeviceId(numericObjectId);
                if (modemInfo === undefined) {
                    return undefined;
                }
                device_ids.push(numericObjectId);
            }

            return { device_ids, alias, typeObject };
        } catch (e) {
            this.logger.error(e);
            throw e;
        }
    }

    // проверяет значение с датчика на условия активации аларма, возвращает ответ можно ли активировать аларм
    private checkValueOnAlarmActivate(config: PreparedAlarmConfigurationType, value: LiveHadledValueType): boolean {
        const { activation_condition, activation_condition_value } = config;

        const canActivateByActivationCondition = checkOnConditionValue(activation_condition, activation_condition_value, value);

        return canActivateByActivationCondition;
    }

    // проверяет значение с датчика на условия завершения активного аларма, возвращает ответ можно ли завершить аларм
    private checkValueOnAlarmFinish(config: PreparedAlarmConfigurationType, value: LiveHadledValueType): boolean {
        const { finish_condition, finish_condition_value } = config;
        if (finish_condition && finish_condition_value) {
            const canFinish = checkOnConditionValue(finish_condition, finish_condition_value, value);
            return canFinish;
            // завершить аларм
        }
        return false;
    }


    // проверяет есть ли указанный конфиг в списке конфигураций, подлежащих проверке для передаваемого устройства и параметра 
    private checkAlarmConfigurationOnExistInDeviceAliasConfigMatchList(
        alarm_config_id: number,
        device_id: number,
        alias: string
    ): boolean {
        const aliasAlarmConfigMatchList = this.deviceAliasConfigurationMatchBindsCacheService.getMatchListForDeviceAlias(device_id, alias);
        const existAlarmConfig = aliasAlarmConfigMatchList.find(item => item.alarm_config_id === alarm_config_id);
        if (existAlarmConfig) {
            return true;
        }
        else {
            return false;
        }
    }

    // получает подробную информацию по устройству и модему связанному с ним.
    // Если связку с модемом не находит, возвращает undefined
    public getDeviceModemData(device_id: number): DeviceModemInfoType | undefined {
        // проверить есть ли устройство - иначе все активные отправить в завершенные / ожидающие подтверждения
        const deviceInfo = this.deviceLocationsSiteBindsCacheService.getDeviceInfoByDeviceId(device_id);

        if (!deviceInfo) {
            return undefined;
        }

        // проверить установлен ли модем - иначе все активные отправить в завершенные / ожидающие подтверждения
        const modemInfo = this.deviceModemBindsCacheService.getModemInfoByDeviceId(device_id);

        if (!modemInfo) {
            return undefined;
        }
        return { deviceInfo, modemInfo };
    }
}