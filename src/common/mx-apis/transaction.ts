import { Config } from "../config";
import axios from "axios";
import axiosRetry from "axios-retry";
import { CrawledTransactions } from "./../../models/";
import { DataSource, QueryRunner } from "typeorm";
import { AbiRegistry, Address, SmartContract } from "@multiversx/sdk-core/out";
import * as fs from "fs";
import { ApiNetworkProvider } from "@multiversx/sdk-network-providers/out";

const config = new Config("./config/config.yaml");

axiosRetry(axios, {
  retries: 3, // Number of retries
  retryCondition: (error: any) => {
    return error.code && error.code === "ETIMEDOUT";
  },
  retryDelay: (retryCount: any) => {
    return retryCount * 1000; // Time delay between retries in milliseconds
  },
});

// Common Event Interface
export interface Event {
  id: string;
  txHash?: string;
  timestamp?: number;
  address?: string;
  topics?: string[];
  data?: any;
  eventName?: string;
}

export class MxAPIs {
  dataSource: DataSource;
  addresses: string[];
  events: string[];
  abi: AbiRegistry;
  config: Config;
  sc: SmartContract[];
  provider: ApiNetworkProvider;

  constructor(contractName: string, config: Config, dataSource: DataSource) {
    const abiPath = config.getContractAbiPath(contractName);
    this.addresses = config.getContractAddress(contractName);

    const abiRegistry = this.getAbiRegistry(abiPath);
    if (abiRegistry != undefined) {
      this.abi = abiRegistry;
      this.sc = this.addresses.map((i) => this.getSC(i, abiRegistry));
    }

    this.dataSource = dataSource;
    this.config = config;
    this.provider = new ApiNetworkProvider(config.getApiUrl());
  }

  private getAbiRegistry(path: string): AbiRegistry | undefined {
    const data = fs.readFileSync(path, { encoding: "utf-8" });
    return AbiRegistry.create(JSON.parse(data));
  }

  private getSC(address: string, abiRegistry: AbiRegistry) {
    return new SmartContract({
      address: new Address(address),
      abi: abiRegistry,
    });
  }

  async getTransactionCount(address: string): Promise<number> {
    const req = `${config.getApiUrl()}/accounts/${address}/transfers/count`;
    const response = await axios.get(req);
    console.log(
      `[${this.abi.name}][getTransactionCount] address: ${address} count: ${response.data}`,
    );
    return response.data;
  }

  async getTransactionHashes(
    address: string,
    from: number,
    size: number,
  ): Promise<[string[], number]> {
    const req = `${config.getApiUrl()}/accounts/${address}/transfers?from=${from}&size=${size}&order=asc`;
    const txResponse = await axios.get(req);
    const jsonResponse = txResponse.data as any[];
    console.log(`[${this.abi.name}][getTransactionHashes] ${req} }`);
    return [
      jsonResponse
        .map((tx: any) => {
          if (tx.status == "success") {
            if (tx.type == "SmartContractResult") {
              return tx.originalTxHash;
            } else {
              return tx.txHash;
            }
          } else {
            return undefined;
          }
        })
        .filter((v) => v !== undefined),
      jsonResponse.length,
    ];
  }

  async getTransactionDetail(hash: string): Promise<any> {
    const req = `${config.getApiUrl()}/transactions/${hash}`;
    const txResponse = await axios.get(req);
    return txResponse.data as any[];
  }

  async filterEvent(
    trackingEvent: string[],
    data: any,
  ): Promise<Event[] | undefined> {
    if (data.logs.events != undefined) {
      let events = data.logs.events;

      events = events.filter((v: any) => {
        const topic = Buffer.from(v.topics[0], "base64").toString("utf8");
        if (trackingEvent.includes(topic)) {
          return true;
        }
        return false;
      });

      events = events
        .map((item: any) => {
          if (item.data == undefined) {
            return undefined;
          }
          const event: Event = {
            id: `${data.txHash}_${item.order}`,
            address: item.address,
            topics: item.topics,
            txHash: data.txHash,
            timestamp: data.timestamp,
            data: Buffer.from(item.data, "base64"),
            eventName: atob(item.topics[0].toString()),
          };
          return event;
        })
        .filter((v: any) => v != undefined);
      return events;
    } else {
      return undefined;
    }
  }

  async getCheckpoint(): Promise<number> {
    const repository = this.dataSource.getRepository(CrawledTransactions);
    const entity = await repository.findOne({
      where: { abi_name: this.abi.name },
    });

    if (entity) {
      console.log(
        `[${this.abi.name}][getCheckpoint] ${JSON.stringify(entity)}`,
      );
      return entity.count;
    } else {
      console.log(`[${this.abi.name}][getCheckpoint] No entity found.`);
      return 0;
    }
  }

  async doSaveCheckpoint(value: number, queryRunner: QueryRunner) {
    const repository = this.dataSource.getRepository(CrawledTransactions);
    const entity = await repository.findOne({
      where: { abi_name: this.abi.name },
    });

    if (entity) {
      entity.count += value;
      console.log(
        `[${this.abi.name}][doSaveCheckPoint] ${JSON.stringify(
          entity,
        )} UpdatedValue ${entity.count}`,
      );
      await queryRunner.manager.save(entity);
    } else {
      console.log(`[${this.abi.name}][doSaveCheckpoint] No entity found.`);
      const newEntity = new CrawledTransactions();
      newEntity.abi_name = this.abi.name;
      newEntity.count = value;
      await queryRunner.manager.save(newEntity);
    }
    console.log(`[${this.abi.name}][doSaveCheckpoint] New checkpoint saved.`);
  }

  async *batchGenerator(
    address: string,
    begin: number,
    txCount: number,
    size: number,
  ) {
    for (let from = begin; from < txCount; from += size) {
      yield this.getTransactionHashes(address, from, size);
    }
  }

  async run() {
    const delay = 6000;
    while (true) {
      for (const address of this.addresses) {
        const txCount = await this.getTransactionCount(address);
        const begin = await this.getCheckpoint();

        if (txCount <= begin) {
          console.log(`[${this.abi.name}][run] All txs were crawled.`);
          await sleep(delay);
          break;
        }

        for await (const result of this.batchGenerator(
          address,
          begin,
          txCount,
          this.config.getBatchSize(),
        )) {
          const txHashes = result[0];
          const count = result[1];

          const acceptedEventsPromises = txHashes.map(async (hash) => {
            const txDetails = await this.getTransactionDetail(hash);
            return this.filterEvent(this.events, txDetails);
          });

          const events = await Promise.all(acceptedEventsPromises);
          const acceptedEvents = [].concat(...events); // Flatten the array of arrays.

          // TODO: checkpoint needs to be saved
          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.startTransaction();

          try {
            await this.saveEvents(acceptedEvents, queryRunner);
            await this.doSaveCheckpoint(count, queryRunner);
            await queryRunner.commitTransaction();
          } catch (err) {
            // since we have errors let's rollback changes we made
            await queryRunner.rollbackTransaction();
          } finally {
            // you need to release query runner which is manually created:
            await queryRunner.release();
          }
        }
      }
    }
  }

  //TODO: Handle edge cases
  async runSnapshot() {
    while (true) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.startTransaction();

      try {
        await this.saveSnapshot(queryRunner);
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
    }
  }

  async saveEvents(events: Event[], queryRunner: QueryRunner) {
    // Abstract method
  }

  async saveSnapshot(queryRunner: QueryRunner) {
    //Abstract method
  }
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
