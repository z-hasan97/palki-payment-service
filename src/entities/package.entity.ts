import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@palki/database';

@Entity('packages')
export class Package extends BaseEntity {
  @Column()
  name: string;

  @Column('decimal')
  price: number;

  @Column()
  durationDays: number;

  @Column('jsonb', { default: '[]' })
  features: string[];

  @Column({ default: true })
  isActive: boolean;
}
