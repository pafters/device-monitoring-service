export type AlarmActiveAlarmsWithAliasItemType = {
    alarm_activation_guid: string;
    alarm_config_id: number;
    device_id: number;
    dt_start: string;
    activation_value: string;
    debug_info?: Record<string, any>;
    alias: string;
}