import { AlarmFinishedAlarms } from "#entities/alarm_finished_alarms.entity";

export type AlarmFinishedAlarmsCacheItemType = { [alarm_config_id: number]: AlarmFinishedAlarms[] }