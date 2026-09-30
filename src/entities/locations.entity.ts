import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Site } from '#entities/sites.entity';

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500, nullable: false })
  name: string;

  @Column({ type: 'int', nullable: false })
  site_id: number;

  @Column({ type: 'int', nullable: true })
  location_id: number;

  @Column({ type: 'varchar', nullable: false })
  back: string;

  @Column({ type: 'int', nullable: true })
  location_type: number | null;

  @Column({ type: 'int', nullable: false })
  location_view_type: number;

  @Column({ type: 'varchar', nullable: false })
  longitude: string;

  @Column({ type: 'varchar', nullable: false })
  latitude: string;

  @Column({ type: 'varchar', nullable: true })
  comment: string | null;

  // Связь с таблицей Site
  @ManyToOne(() => Site, (site) => site.locations)
  @JoinColumn({ name: 'site_id' })
  site?: Site;
}
