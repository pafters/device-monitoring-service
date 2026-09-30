import { PreparedConditionValueType } from "#/types/PreparedConditionValue.type";
import { AlarmLevelEnum } from "#modules/cache/alarm-finished-alarms/types/AlarmLevel.enum";
import { ConditionType } from "#modules/postgres/types/Condition.type";

export type PreparedAlarmConfigurationType = {
    alarm_config_id: number;
    alias: string;
    activation_condition: ConditionType;
    activation_condition_value: PreparedConditionValueType;
    activation_condition_time_to_activate_ms: number;
    finish_condition?: ConditionType;
    finish_condition_value: PreparedConditionValueType;
    finish_condition_time_to_activate_ms: number;
    alarm_level: AlarmLevelEnum;
    alarm_activation_text: string;
    finish_without_acknowledgement: boolean;
    deleted_at?: string;
}