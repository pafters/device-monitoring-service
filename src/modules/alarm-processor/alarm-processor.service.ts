import { Inject, Logger, LoggerService, OnModuleInit } from "@nestjs/common";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { AlarmActiveAlarmsCacheService } from "#cache/alarm-active-alarms/alarm-active-alarms.cache.service";
import { ValkeyService } from "#modules/valkey/valkey.service";
import { SystemConfigService } from "#modules/system-config/system-config.service";
import { CheckOnAlarmsService } from "#modules/check-on-alarms/check-on-alarms.service";
import { BaseCacheService } from "#modules/cache/base-cache.service";
import { DeviceAliasConfigurationMatchBindsCacheService } from "#modules/cache/device-alias-configuration-match-binds/device-alias-configuration-match-binds.cache.service";
import { DeviceModemBindsCacheService } from "#modules/cache/device-modem-binds/device-modem-binds.cache.service";
import { AlarmConfigurationCacheService } from "#modules/cache/alarm-configuration/alarm-configuration.cache.service";
import { AlarmFinishedAlarmsCacheService } from "#modules/cache/alarm-finished-alarms/alarm-finished-alarms.cache.service";
import { DeviceModemInfoType } from "#modules/check-on-alarms/types/DeviceModemInfo.type";
import { ValkeyItemWithHandledValueType } from "#modules/valkey/types/ValkeyItemWithValue.type";
import { PreparedAlarmConfigurationType } from "#modules/cache/alarm-configuration/types/PreparedAlarmConfiguration.type";
import { PreparedDataForCheckOnAlarmByValkeyKeyItemType } from "#modules/check-on-alarms/types/PreparedDataForCheckOnAlarmByValkeyKeyItem.type";

export class AlarmProcessorService implements OnModuleInit {

    private checkAllValidDevicesIsProcessing = false;
    private checkActiveAlarmsOnFinishIsProcessing = false;

    private firstInitedIsFinished = true;

    private checkAllPreActiveAlarmsIsInited = false;
    private checkAllPreActiveAlarmsOnRealActivationIsProcessing = false;

    private checkAllPreFinishedAlarmsOnRealFinishIsProcessing = false;
    private checkAllPreFinishedAlarmsIsInited = false;

    constructor(
        private readonly valkeyService: ValkeyService,
        private readonly systemConfig: SystemConfigService,
        private readonly checkOnAlarmsService: CheckOnAlarmsService,
        private readonly baseCacheService: BaseCacheService,
        private readonly deviceAliasConfigurationMatchBindsCacheService: DeviceAliasConfigurationMatchBindsCacheService,
        private readonly deviceModemBindsCacheService: DeviceModemBindsCacheService,
        private readonly alarmConfigurationCacheService: AlarmConfigurationCacheService,
        private readonly alarmActiveAlarmCacheService: AlarmActiveAlarmsCacheService,
        private readonly alarmFinishedAlarmsCacheService: AlarmFinishedAlarmsCacheService,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, AlarmProcessorService.name);
    }

    onModuleInit(): void {
        this.subscribeOnCacheUpdating();
    }

    private subscribeOnCacheUpdating(): void {
        this.logger.log(`(subscribeOnCacheUpdating) STARTED`);
        this.baseCacheService.subscribeToUpdateAllCacheEvent(() => {
            this.init();
        })
        this.baseCacheService.subscribeToUpdateAlarmConfigsCacheEvent(() => {
            if (this.firstInitedIsFinished === false) {
                return;
            }
            this.checkActiveAlarmsOnCacheValidElseFinish();
        });
    }


    // первый запуск
    private async init(): Promise<void> {
        this.logger.log('FIRST INITING...');
        await this.checkActiveAlarmsOnCacheValidElseFinish();

        this.checkAllPreActiveAlarmsOnRealActivation();
        this.checkAllPreFinishedAlarmsOnRealFinish();

        await this.checkAllValidDevicesOnActivateOrFinishAlarm();

        this.checkLiveSubDataOnAlarmActivationOrFinish();
        this.logger.log('FIRST INITING FINISHED');
        this.firstInitedIsFinished = true;
    }



    // проверка всех валидных устройств на предактивацию или активацию алармов
    private async checkAllValidDevicesOnActivateOrFinishAlarm(): Promise<void> {
        try {
            // проверяем завершилась ли прошлая итерация проверки, если не завершилась, то пропускаем эту итерацию
            if (this.checkAllValidDevicesIsProcessing === true) {
                this.logger.warn(`(checkAllValidDevicesOnActivateOrFinishAlarm) can not be started cause method is processing yet.`);
                return;
            }

            // указываем информатор о том, что проверка запущена
            this.checkAllValidDevicesIsProcessing = true;
            this.logger.warn(`(checkAllValidDevicesOnActivateOrFinishAlarm) method was just started`);

            // получаем весь список валидных устройств
            const deviceIds = this.deviceModemBindsCacheService.getAllDevices();

            // определяем список существующих на момент проверки список конфигураций
            const allAliasConfigs = this.alarmConfigurationCacheService.getAllConfigs();

            for (const device_id of deviceIds) {
                await this.processDeviceForAlarmChecks(device_id, allAliasConfigs);
            }
        } catch (e) {
            this.logger.error(
                `(checkAllValidDevicesOnActivateOrFinishAlarm) ERROR while checking devices on alarm activation`
            );
            this.logger.error(e);
        } finally {
            // записываем в информатор то, что проверка завершилась
            this.checkAllValidDevicesIsProcessing = false;
            this.logger.warn(`(checkAllValidDevicesOnActivateOrFinishAlarm) method has been finished`);
        }
    }


    // проверка алармов на изменений данных в кэше: удалено устройство/конфигурация, связка к устройству больше не актуальна, ...
    private async checkActiveAlarmsOnCacheValidElseFinish(): Promise<void> {
        try {
            // проверяем завершилась ли прошлая итерация проверки, если не завершилась, то пропускаем эту итерацию
            if (this.checkActiveAlarmsOnFinishIsProcessing === true) {
                // only for trace
                this.logger.warn(`(checkActiveAlarmsOnCacheValidElseFinish) can not be started cause method is processing yet.`);
                return;
            }
            // указываем информатор о том, что проверка запущена
            this.checkActiveAlarmsOnFinishIsProcessing = true;
            // only for trace
            // this.logger.warn(`(checkActiveAlarmsOnCacheValidElseFinish) method was just started`);

            // запрашиваем весь список аварий без сортировки по устройствам (предлагаю пока оставить так)
            const cachedActiveAlarms = this.alarmActiveAlarmCacheService.getAllDeviceActiveAlarms();
            for (const item of cachedActiveAlarms) {
                await this.checkOnAlarmsService.checkActiveAlarmsOnCacheValidElseFinish(item);
            }

        } catch (e) {
            this.logger.error('(checkActiveAlarmsOnCacheValidElseFinish) ERROR while checking active alarms on finish');
            this.logger.error(e);
        } finally {
            // записываем в информатор то, что проверка завершилась
            this.checkActiveAlarmsOnFinishIsProcessing = false;
            // only for trace
            // this.logger.warn(`(checkActiveAlarmsOnCacheValidElseFinish) has been finished`);
        }
    }


    // проверка поступающих по valkey оперативных данных на активацию или предактивацию алармов
    private checkLiveSubDataOnAlarmActivationOrFinish(): void {
        this.valkeyService.subscribeToChanges(this.systemConfig.valkeyConfig.changesChannel, async (valkeyKey) => {
            try {
                // получаем id устройства/устройств и наименование параметра, исходя из ключа, который пришел по подписке valkey 
                const preparedDataForCheck = this.checkOnAlarmsService.prepareDataToCheckOnAlarmsByValkeyKey(valkeyKey);
                // если никакой информации не получили по этому поступившему параметру, то ничего больше не делаем по нему
                await this.processDevicesForCheckOnAlarmActivationOrFinish(preparedDataForCheck, valkeyKey);
            } catch (e) {
                this.logger.error(
                    `(checkLiveDataOnActivateAlarm) ERROR from valkey subscription for valkey key=${valkeyKey}`
                );
                this.logger.error(e);
            }
        });
    }


    // проверяет пред-активные алармы на полноценную активацию либо снятие с пред-активных
    private checkAllPreActiveAlarmsOnRealActivation() {
        if (this.checkAllPreActiveAlarmsIsInited === true) {
            this.logger.error(
                `(checkAllPreActiveAlarmsOnRealActivation) ERROR The method wanted to be initialized one more time`
            );
            return;
        }
        this.checkAllPreActiveAlarmsIsInited = true;
        setInterval(async () => {
            try {
                if (this.checkAllPreActiveAlarmsOnRealActivationIsProcessing === true) {
                    this.logger.warn(`(checkAllPreActiveAlarmsOnRealActivation) the method cannot be started cause method is processing yet.`);
                    return;
                }
                this.checkAllPreActiveAlarmsOnRealActivationIsProcessing = true;
                // получаем все пред-активные алармы
                const allPreActiveAlarms = this.alarmActiveAlarmCacheService.getAllPreActiveAlarms();
                const dateNow = Date.now();
                // определяем какие пред-активные алармы прошли свой срок жизни
                //  и требуют полноценной активации либо снятия с отслеживания
                const alarmNeededToActivate = allPreActiveAlarms.filter(x => dateNow - x.fixedAt >= x.timeToRealActivateMs);

                // only for trace 
                // this.logger.log(`(checkAllPreActiveAlarmsOnRealActivation) allPreActiveAlarms length = ${allPreActiveAlarms.length}`);
                // this.logger.log(`(checkAllPreActiveAlarmsOnRealActivation) alarmNeededToActivate length = ${alarmNeededToActivate.length}`);
                await Promise.all(alarmNeededToActivate.map(async x => {
                    try {
                        // если времени прошло достаточно, то проводим проверку на полноценную активацию
                        await this.checkOnAlarmsService.checkPreActiveAlarmOnRealActivation(x.device_id, x.alarm_config_id, x.valkeyKey, x.alias);
                        this.alarmActiveAlarmCacheService.removeFromPreActiveAlarmsIfExist(x.device_id, x.alarm_config_id);
                    } catch (error) {
                        this.logger.error(`(checkAllPreActiveAlarmsOnRealActivation) ERROR while proccessing check pre-active alarms on real activation for device_id="${x?.device_id}, alias="${x?.alias}, alarm_config_id="${x?.alarm_config_id}"`);
                        this.logger.error(error);
                    }
                }))

            } catch (e) {
                this.logger.error(`(checkAllPreActiveAlarmsOnRealActivation) ERROR while proccessing check all pre-active alarms on real activation`);
                this.logger.error(e);
            }
            finally {
                this.checkAllPreActiveAlarmsOnRealActivationIsProcessing = false;
            }
        }, 1000);
    }

    // проверяет пред-завершенные алармы на полноценное завершение либо снятие с пред-завершенных
    private async checkAllPreFinishedAlarmsOnRealFinish() {
        if (this.checkAllPreFinishedAlarmsIsInited === true) {
            this.logger.error(
                `(checkAllPreFinishedAlarmsOnRealFinish) ERROR The method wanted to be initialized one more time`
            );
            return;
        }
        this.checkAllPreFinishedAlarmsIsInited = true;

        await this.checkPreFinished();

    }

    private async checkPreFinished() {
        try {
            if (this.checkAllPreFinishedAlarmsOnRealFinishIsProcessing === true) {
                this.logger.warn(`(checkAllPreFinishedAlarmsOnRealFinish) the method cannot be started cause method is processing yet.`);
                return;
            }
            this.checkAllPreFinishedAlarmsOnRealFinishIsProcessing = true;
            // получаем весь список отложенных на завершение алармов
            const allPreFinishedAlarms = this.alarmFinishedAlarmsCacheService.getAllPreFinishedAlarms();

            // определяем какие пред-завершенные алармы прошли свой срок жизни
            //  и требуют полноценного завершения либо снятия с отслеживания
            const dateNow = Date.now();
            const alarmNeededToFinish = allPreFinishedAlarms.filter(x => dateNow - x.fixedAt >= x.timeToRealFinishMs);

            // only for trace 
            // this.logger.log(`(checkAllPreFinishedAlarmsOnRealFinish) allPreFinishedAlarms length = ${allPreFinishedAlarms.length}`);
            // this.logger.log(`(checkAllPreFinishedAlarmsOnRealFinish) alarmNeededToFinish length = ${alarmNeededToFinish.length}`);
            const promises = alarmNeededToFinish.map(async x => {
                try {
                    // проводим проверку на полноценное завершение
                    await this.checkOnAlarmsService.checkPreFinishedAlarmOnRealFinish(x.device_id, x.alarm_config_id, x.valkeyKey, x.alias);
                    // в любом исходе проверки на завершение или снятие запись пред-завершения больше не должна существовать, 
                    // так как ее срок жизни вышел - либо она полноценно завершается и исчезает, либо просто исчезает :*) 
                    this.alarmFinishedAlarmsCacheService.removeFromPreFinishedAlarmsIfExist(x.device_id, x.alarm_config_id);
                } catch (error) {
                    this.logger.error(
                        `(checkAllPreFinishedAlarmsOnRealFinish) ERROR while proccessing check pre-finished alarm on real finish for device_id="${x?.device_id}, alias="${x?.alias}, alarm_config_id="${x?.alarm_config_id}"`
                    );
                    this.logger.error(error);
                    throw error;
                }
            })
            await Promise.all(promises);
        } catch (e) {
            this.logger.error(
                `(checkAllPreFinishedAlarmsOnRealFinish) ERROR while proccessing check all pre-finished alarms on real finish`
            );
            this.logger.error(e);
        } finally {
            this.checkAllPreFinishedAlarmsOnRealFinishIsProcessing = false;
            setTimeout(async () => {
                await this.checkPreFinished();
            }, 1000);
        }
    }


    /******************************************************/
    /****** Вспомогательные для проверок методы ***********/
    /******************************************************/


    /*
        * Обрабатывает один device_id: ищет устройство+модем, находит конфигурации под него,
        * получает live data и выполняет проверки по каждому alarmConfigInfo.
    */
    private async processDeviceForAlarmChecks(device_id: number, allAliasConfigs: any): Promise<void> {
        // получаем устройство и модем перед проверкой на активацию
        const deviceModemData = this.checkOnAlarmsService.getDeviceModemData(device_id);

        // если нет связки устройство + модем для этого device_id, 
        // то ничего не делаем и ничего не проверяем по нему
        if (deviceModemData === undefined) {
            this.logger.warn(`(processDeviceForAlarmChecks) device or modem data not found for device_id="${device_id}"`);
            return;
        }

        const { modemInfo } = deviceModemData;

        // получаем список доступных для этого устройства конфигураций под проверки
        const deviceAliasMatchConfigs =
            this.deviceAliasConfigurationMatchBindsCacheService.getAllMatchListForDevice(device_id, allAliasConfigs);

        if (deviceAliasMatchConfigs.size === 0) {
            return;
        }

        // по каждому параметру, что есть в доступной конфигурации начинаем проверку
        for (const alias of deviceAliasMatchConfigs.keys()) {
            try {
                // определяем список конфигураций в мэтч-листе по этому параметру
                const aliasMatchData = deviceAliasMatchConfigs.get(alias);
                const aliasAlarmConfigMatchList = aliasMatchData?.configList ?? [];

                // если для этого устройства связок никаких нет по параметру, то ничего не делать
                if (aliasAlarmConfigMatchList.length === 0) {
                    // only for trace
                    // this.logger.log(
                    //     `(processDeviceForAlarmChecks) match-list configs is empty for device_id="${device_id}" and alias="${alias}"`
                    // );
                    continue;
                }

                // получаем данные по пришедшему по устройству параметру 
                const liveData = await this.valkeyService.getLiveDataWithHandledValueByAliasAndModemDeviceInfo(
                    alias,
                    modemInfo.modem_id,
                    device_id
                );

                // если не находим оперативные данные по датчику, то ничего не делаем
                // если авария существует - то отсутствие значения считаем аварийным
                // если аварии нет, то не заводим ее
                if (liveData === undefined) {
                    this.logger.error(
                        `(processDeviceForAlarmChecks) valkey data for device_id="${device_id}", modem_id=${modemInfo.modem_id} and alias="${alias}" not found`
                    );
                    continue;
                }

                const { valkeyKey, deviceAliasValkeyData } = liveData;

                // если связки на проверки по конфигурации есть и само устройство подключено к модему,
                // то начинаем проводить полноценную проверку этого устройства и параметра по конфигурациям
                for (const alarmConfigInfo of aliasAlarmConfigMatchList) {
                    await this.checkAlarmConfigOnAlarmActivationOrFinishByLiveData(
                        deviceModemData,
                        alarmConfigInfo,
                        deviceAliasValkeyData,
                        valkeyKey
                    )
                }
            } catch (e) {
                this.logger.error(`(processDeviceForAlarmChecks) ERROR while handling deviceAliasMatchConfigs items for alias="${alias}", device_id="${device_id}"`);
                this.logger.error(e);
            }
        }
    }

    // проверяет конкретную конфигурацию на выполнение условий активации или завершения
    // аларма по оперативным значениям с датчика
    private async checkAlarmConfigOnAlarmActivationOrFinishByLiveData(
        deviceModemData: DeviceModemInfoType,
        alarmConfigInfo: PreparedAlarmConfigurationType,
        deviceAliasValkeyData: ValkeyItemWithHandledValueType,
        valkeyKey: string
    ) {
        try {
            // проверяем возможно ли активировать или предактивировать аларм по этой конфигурации для этого устройства
            const isActivationState = await this.checkOnAlarmsService.checkValkeyDataOnAlarmActivationByAlarmConfig(
                deviceModemData,
                alarmConfigInfo,
                deviceAliasValkeyData,
                valkeyKey
            );
            // если условия активации выполняются, то мы не можем завершать активную аварию
            if (isActivationState === true) {
                return;
            }

            // дальше рассматривается случай, если условия активации не выполняются
            await this.checkOnAlarmsService.checkValkeyDataOnAlarmFinishByAlarmConfig(
                deviceModemData,
                alarmConfigInfo,
                deviceAliasValkeyData,
                valkeyKey
            );
        } catch (e) {
            const deviceInfo = deviceModemData?.deviceInfo;
            this.logger.error(
                `(checkAlarmConfigOnAlarmActivationOrFinishByLiveData) ERROR while checking alarm config with alarm_config_id="${alarmConfigInfo?.alarm_config_id}" alias="${alarmConfigInfo?.alias}" and device_id="${deviceInfo?.device_id}" on activate alarm`
            );
            this.logger.error(e);
        }
    }

    // Метод собирает все необходимые данные для проверки на активацию или завершение аларма: 
    // * Определяет список подходящих конфигураций, по которым нужно проводить проверки по каждому устройству.
    // * Находит подробную информацию по устройству и модему.
    // * Получает оперативные значения из valkey по датчику.
    // * Отправляет на проверку каждую подходящую конфигурацию по алармам на активацию или завершение в соответствии
    // * со значениями по датчику.
    private async processDevicesForCheckOnAlarmActivationOrFinish(
        preparedDataForCheck: PreparedDataForCheckOnAlarmByValkeyKeyItemType | undefined,
        valkeyKey: string
    ): Promise<void> {
        if (!preparedDataForCheck) {
            this.logger.warn(
                `(processDevicesForCheckOnAlarmActivationOrFinish) prepared data for check not found for key="${valkeyKey}"`
            );
            return;
        }

        const { device_ids, alias } = preparedDataForCheck;

        // если список устройств, по которым нужно проводить проверки пуст
        if (device_ids.length === 0) {
            // only for trace
            // this.logger.warn(`(processDevicesForCheckOnAlarmActivationOrFinish) device list is empty for valkey key="${valkeyKey}"`)
            return;
        }

        // или если alias невалиден 
        if (alias === undefined) {
            this.logger.error(`(processDevicesForCheckOnAlarmActivationOrFinish) alias is undefined for key="${valkeyKey}"`)
            return;
        }

        for (const device_id of device_ids) {
            // получаем список связок, по которым можно проверить данное устройство на активацию аларма
            const aliasAlarmConfigMatchList = this.deviceAliasConfigurationMatchBindsCacheService.getMatchListForDeviceAlias(
                device_id,
                alias
            );

            // если для этого устройства связок никаких нет,
            //  по которым можно проверить на активацию, то ничего не делаем и не проверяем это устройство
            if (aliasAlarmConfigMatchList.length === 0) {
                // only for trace
                // this.logger.debug!(
                //     `(processDevicesForCheckOnAlarmActivationOrFinish) match-list configs is empty for device_id="${device_id}" and alias="${alias}"`
                // );
                continue;
            }

            // получаем устройство и модем перед проверкой на активацию
            const deviceModemData = this.checkOnAlarmsService.getDeviceModemData(device_id);

            // если нет связки устройство + модем для этого device_id, 
            // то ничего не делаем и ничего не проверяем по нему
            if (deviceModemData === undefined) {
                continue;
            }

            // получаем данные по пришедшему по устройству параметру 
            const deviceAliasValkeyData = await this.valkeyService.getLiveDataWithHandledValueByValkeyKey(valkeyKey);
            if (deviceAliasValkeyData === undefined) {
                this.logger.error(
                    `(processDevicesForCheckOnAlarmActivationOrFinish) valkeyData for key "${valkeyKey}" and device_id="${device_id}" not found`
                );
                continue;
            }

            // если связки на проверки по конфигурации есть и само устройство подключено к модему,
            // то начинаем проводить полноценную проверку этого устройства и параметра по конфигурациям
            for (const alarmConfigInfo of aliasAlarmConfigMatchList) {
                await this.checkAlarmConfigOnAlarmActivationOrFinishByLiveData(
                    deviceModemData,
                    alarmConfigInfo,
                    deviceAliasValkeyData,
                    valkeyKey
                );
            }
        }
    }
}