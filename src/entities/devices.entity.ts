import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500, nullable: false })
  name: string;

  @Column({ type: 'int', nullable: false })
  model_id: number;

  @Column({ type: 'int', nullable: false })
  device_type: number;

  @Column({ type: 'varchar', length: 500, nullable: false })
  address: string;

  @Column({ type: 'int', nullable: true })
  location_id: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  guid: string | null;

  @Column({ type: 'varchar', nullable: false })
  latitude: string;

  @Column({ type: 'varchar', nullable: false })
  longitude: string;

  @Column({ type: 'int', nullable: true })
  template_id: number | null;

  @Column({ type: 'int', nullable: true })
  alias_template_id: number | null;

  @Column({ type: 'int', nullable: true })
  server_alias_template_id: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  number: string | null;
}
