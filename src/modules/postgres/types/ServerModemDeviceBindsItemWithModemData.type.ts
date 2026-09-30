import { MainModemDataType } from "./MainModemData.type";

export type ServerModemDeviceBindsItemWithModemData = {
    id: number;
    device_id: number;
    server_id: number;
    modem_id: number;
    Modem: MainModemDataType
}