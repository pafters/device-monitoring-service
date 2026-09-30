import { LiveHadledValueType } from "#/types/LiveHadledValue.type";

export type PreActiveAlarmItemType = {
    fixedAt: number;
    fixedValue: LiveHadledValueType;
    alias: string;
    device_id: number;
    alarm_config_id: number;
    valkeyKey: string;
    timeToRealActivateMs: number;
}