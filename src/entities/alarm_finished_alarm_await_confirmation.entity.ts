import { AlarmFinishReasonEnum } from '#constants/AlarmFinishReason.enum';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('alarm_finished_alarm_await_confirmation')
export class AlarmFinishedAlarmAwaitConfirmation {
    @PrimaryColumn({ type: 'varchar', length: 500, nullable: false })
    alarm_activation_guid: string;

    @Column({ type: 'int4', nullable: false })
    alarm_config_id: number;

    @Column({ type: 'int4', nullable: false })
    device_id: number;

    @Column({ type: 'varchar', length: 500, nullable: false })
    activation_value: string;

    @Column({ type: 'timestamptz', nullable: false })
    dt_start: string;

    @Column({ type: 'timestamptz', nullable: false })
    dt_end: string;

    @Column({ type: 'varchar', nullable: false })
    finish_reason: AlarmFinishReasonEnum;

    @Column({ type: 'json', nullable: true })
    debug_info?: Record<string, any>;
}