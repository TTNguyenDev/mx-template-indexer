import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class CrawledTransactions {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  abi_name: string;

  @Column({ default: 0 })
  count: number;
}
