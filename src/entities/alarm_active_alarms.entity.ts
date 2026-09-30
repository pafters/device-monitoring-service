import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('alarm_active_alarms')
export class AlarmActiveAlarms {
    @PrimaryColumn({ type: 'varchar', length: 500, nullable: false })
    alarm_activation_guid: string;

    @Column({ type: 'int4', nullable: false })
    alarm_config_id: number;

    @Column({ type: 'int4', nullable: false })
    device_id: number;

    @Column({ type: 'timestamptz', nullable: false })
    dt_start: string;

    @Column({ type: 'varchar', length: 500, nullable: false })
    activation_value: string;

    @Column({ type: 'json', nullable: true })
    debug_info?: Record<string, any>;
}