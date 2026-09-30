import { DeviceLocationsSiteBindsMapItemType } from "#modules/cache/device-locations-site-binds/types/DeviceLocationsSiteBindsMapItem.type";
import { MainModemDataType } from "#modules/postgres/types/MainModemData.type";

export type DeviceModemInfoType = {
    deviceInfo: DeviceLocationsSiteBindsMapItemType;
    modemInfo: MainModemDataType;
}