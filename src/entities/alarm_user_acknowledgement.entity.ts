import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('alarm_user_acknowledgement')
export class AlarmUserAcknowledgement {
  @PrimaryGeneratedColumn()
  alarm_user_acknowledgement_id: number;

  @Column({ type: 'varchar', length: 500, nullable: false })
  alarm_activation_guid: string;

  @Column({ type: 'int4', nullable: false })
  user_id: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_comment?: string;

  @Column({ type: 'timestamptz', nullable: false })
  acknowledgement_dt: string;
}