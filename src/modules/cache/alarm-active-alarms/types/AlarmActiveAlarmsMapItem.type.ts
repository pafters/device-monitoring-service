
import { AlarmActiveAlarmsWithAliasItemType } from "#modules/postgres/types/AlarmActiveAlarmsWithAliasItem.type";
export type AlarmActiveAlarmsMapItemType = { [alarm_config_id: number]: AlarmActiveAlarmsWithAliasItemType }