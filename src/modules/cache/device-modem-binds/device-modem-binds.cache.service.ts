import { Inject, Logger, LoggerService } from "@nestjs/common";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { M500Service } from "#modules/postgres/m500.service";
import { ServerModemDeviceBindsItemWithModemData } from "#modules/postgres/types/ServerModemDeviceBindsItemWithModemData.type";
import { MainModemDataType } from "#modules/postgres/types/MainModemData.type";

export class DeviceModemBindsCacheService {
    private modemDevicesMap = new Map<number, number[]>(); // связка модем:устройство может иметь тип 1:M
    private deviceModemMap = new Map<number, MainModemDataType>(); // когда связка устройство:модем имеет тип 1:1

    private firstCacheIsInited = false;

    constructor(
        private readonly m500Service: M500Service,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, DeviceModemBindsCacheService.name);
    }

    public async firstCacheInit() {
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
            const serverModemDeviceBinds = await this.m500Service.getServerModemDeviceBindsWithModemData();
            this.updateCacheMap(serverModemDeviceBinds);
        } catch (e) {
            this.logger.error(e);
        }
    }

    private updateCacheMap(serverModemDeviceBinds: ServerModemDeviceBindsItemWithModemData[]): void {
        const newDeviceModemMap = new Map<number, MainModemDataType>();
        const newModemDevicesMap = new Map<number, number[]>();

        for (const item of serverModemDeviceBinds) {
            newDeviceModemMap.set(item.device_id, item.Modem);

            const modemDeviceMapItem = newModemDevicesMap.get(item.modem_id) ?? [];
            modemDeviceMapItem.push(item.device_id);
            newModemDevicesMap.set(item.modem_id, modemDeviceMapItem);
        }

        this.modemDevicesMap = newModemDevicesMap;
        this.deviceModemMap = newDeviceModemMap;
    }

    public getDeviceIdsByModemId(modem_id: number | null | undefined): number[] {
        if (!modem_id) {
            return [];
        }
        return this.modemDevicesMap.get(modem_id) ?? [];
    }

    public getModemInfoByDeviceId(device_id: number | null | undefined): MainModemDataType | undefined {
        return device_id ? this.deviceModemMap.get(device_id) : undefined;
    }

    public getAllDevices(): number[] {
        return Array.from(this.deviceModemMap.keys());
    }
}