import { AlarmFinishReasonEnum } from "#constants/AlarmFinishReason.enum";

export class AlarmFinishedAlarmsDTO {
    alarm_activation_guid: string;
    alarm_config_id: number;
    device_id: number;
    activation_value: string;
    dt_start: string;
    dt_end: string;
    finish_reason: AlarmFinishReasonEnum;
    debug_info?: Record<string, any>;
}