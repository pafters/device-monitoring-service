import { Inject, Logger, LoggerService } from "@nestjs/common";
import { getLocationPath } from "#helpers/getLocationPath.helper";
import { addContextDecoratorLogger } from "#infrastructure/logger/context.decorator.logger";
import { M500Service } from "#modules/postgres/m500.service";
import { DeviceLocationSiteItemType } from "#modules/postgres/types/DeviceLocationSiteItem.type";
import { LocationBindsItemType } from "#modules/postgres/types/LocationBindsItem.type";
import { DeviceLocationsSiteBindsMapItemType } from "#cache/device-locations-site-binds/types/DeviceLocationsSiteBindsMapItem.type";

export class DeviceLocationsSiteBindsCacheService {

    private deviceLocationsModemSiteBindsMap = new Map<number, DeviceLocationsSiteBindsMapItemType>();

    private firstCacheIsInited = false;

    constructor(
        private readonly m500Service: M500Service,
        @Inject(Logger) private readonly logger: LoggerService,
    ) {
        this.logger = addContextDecoratorLogger(logger, DeviceLocationsSiteBindsCacheService.name);
    }

    public async firstCacheInit(): Promise<void> {
        if (this.firstCacheIsInited === true) {
            this.logger.warn(`(firstCacheInit) the method has already called`);
            return;
        }
        this.logger.log(`FIRST INIITING...`);
        this.initCache();
        this.logger.log(`FIRST INITING FINISHED.`);
    }


    public async initCache(): Promise<void> {
        try {
            const deviceLocationSitesList = await this.m500Service.getDeviceLocationSites();
            const locationList = await this.m500Service.getLocationSiteBinds();

            const newDeviceLocationsModemSitesMap = this.createDeviceLocationsModemSiteBindsMap(
                deviceLocationSitesList,
                locationList,
            );

            this.deviceLocationsModemSiteBindsMap = newDeviceLocationsModemSitesMap;
        } catch (e) {
            this.logger.error(e);
        }
    }

    public getDeviceInfoByDeviceId(deviceId: number): DeviceLocationsSiteBindsMapItemType | undefined {
        return this.deviceLocationsModemSiteBindsMap.get(deviceId);
    }

    private createDeviceLocationsModemSiteBindsMap(
        deviceLocationSitesList: DeviceLocationSiteItemType[],
        locationList: LocationBindsItemType[],
    ): Map<number, DeviceLocationsSiteBindsMapItemType> {
        const deviceLocationsModemSiteBindsMap = new Map<number, DeviceLocationsSiteBindsMapItemType>();

        for (const item of deviceLocationSitesList) {
            const locationPathData = getLocationPath(item.location_id, locationList);
            deviceLocationsModemSiteBindsMap.set(item.device_id, {
                ...item,
                locationPath: locationPathData.path,
                locationPathName: locationPathData.pathName,
                site_name: locationPathData.site_name,
            })
        }
        return deviceLocationsModemSiteBindsMap;
    }

}