import { AlarmLevelEnum } from '#modules/cache/alarm-finished-alarms/types/AlarmLevel.enum';
import { ConditionType } from '#modules/postgres/types/Condition.type';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('alarm_configurations')
export class AlarmConfiguration {
    @PrimaryGeneratedColumn()
    alarm_config_id: number;

    @Column({ type: 'varchar', nullable: false })
    alias: string;

    @Column({ type: 'varchar', nullable: false })
    activation_condition: ConditionType;

    @Column({ type: 'varchar', nullable: false })
    activation_condition_value: string;

    @Column({ type: 'int4', nullable: false })
    activation_condition_time_to_activate_ms: number;

    @Column({ type: 'varchar', nullable: false })
    finish_condition?: ConditionType;

    @Column({ type: 'varchar', nullable: false })
    finish_condition_value?: string;

    @Column({ type: 'int4', nullable: false })
    finish_condition_time_to_activate_ms: number;

    @Column({ type: 'varchar', nullable: false })
    alarm_level: AlarmLevelEnum;

    @Column({ type: 'varchar', length: 500, nullable: false })
    alarm_activation_text: string;

    @Column({ type: 'bool', nullable: false, default: true })
    finish_without_acknowledgement: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    deleted_at?: string;
}