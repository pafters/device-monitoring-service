import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Location } from '#entities/locations.entity';

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: false })
  image: string;

  @OneToMany(() => Location, (location) => location.site)
  locations: Location[];
}
