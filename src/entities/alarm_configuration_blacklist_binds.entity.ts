import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('alarm_configuration_blacklist_binds')
export class AlarmConfigurationBlacklistBinds {
    @PrimaryGeneratedColumn()
    alarm_configuration_blacklist_binds_id: number

    @Column({ type: 'int4', nullable: false })
    alarm_config_id: number;

    @Column({ type: 'int4', nullable: true })
    device_id?: number;

    @Column({ type: 'int4', nullable: true })
    server_alias_template_id?: number;

    @Column({ type: 'int4', nullable: true })
    model_id?: number;

    @Column({ type: 'int4', nullable: true })
    location_id?: number;

    @Column({ type: 'int4', nullable: true })
    site_id?: number;
}