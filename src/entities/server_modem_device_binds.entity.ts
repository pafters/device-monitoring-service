import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('server_modem_device_binds')
export class ServerModemDeviceBinds {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int4', nullable: false })
  device_id: number;

  @Column({ type: 'int4', nullable: false })
  server_id: number;

  @Column({ type: 'int4', nullable: false })
  modem_id: number;
}
