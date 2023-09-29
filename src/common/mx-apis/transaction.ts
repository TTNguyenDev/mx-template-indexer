import { Config } from "../config";
import axios from "axios";
import axiosRetry from "axios-retry";
import { CrawledTransactions } from "./../../models/";
import { getManager, DataSource, EntityManager } from "typeorm";
import { AbiRegistry, BinaryCodec } from "@multiversx/sdk-core/out";
import * as fs from "fs";

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

export class Transaction {
  dataSource: DataSource;
  addresses: string[];
  events: string[];
  abi: AbiRegistry;
  config: Config;

  getAbiRegistry(path: string): AbiRegistry | undefined {
    const data = fs.readFileSync(path, { encoding: "utf-8" });
    return AbiRegistry.create(JSON.parse(data));
  }
  async txCount(address: string): Promise<number> {
    const req = `${config.getApiUrl()}/accounts/${address}/transfers/count`;
    const response = await axios.get(req);
    return response.data;
  }

  async TxHashes(
    address: string,
    from: number,
    size: number
  ): Promise<[string[], number]> {
    const req = `${config.getApiUrl()}/accounts/${address}/transfers?from=${from}&size=${size}`;
    console.log(req);
    const txResponse = await axios.get(req);
    const jsonResponse = txResponse.data as any[];
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
    data: any
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
            eventName: atob(item.topics[0].toString()), // Decoded topic is stored in eventName
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
    const entity = await repository.findOne({ where: { abi_name: "pairs" } });

    if (entity) {
      // The entity with the specified name was found
      console.log(entity);
      return entity.count;
    } else {
      // No entity with the specified name was found
      console.log("No entity found.");
      return 0;
    }
  }
  async saveCheckpoint(value: number, entityManager: EntityManager) {
    const repository = this.dataSource.getRepository(CrawledTransactions);
    const entity = await repository.findOne({ where: { abi_name: "pairs" } });

    if (entity) {
      // The entity with the specified name was found
      console.log(entity);
      entity.count += value;
      await entityManager.save(entity);
    } else {
      // No entity with the specified name was found
      console.log("No entity found.");
      const newEntity = new CrawledTransactions();
      newEntity.abi_name = "pairs";
      newEntity.count = value;
      await entityManager.save(newEntity);
    }
    console.log("New checkpoint saved");
  }

  async run() {
    while (true) {
      await Promise.all(
        this.addresses.map(async (address) => {
          const txCount = await this.txCount(address);
          const begin = await this.getCheckpoint();

          console.log(txCount);
          if (txCount <= begin) {
            console.log("All txs were crawled");
            await sleep(6000);
            return;
          }
          const size = this.config.getBatchSize();

          const promises = [];
          for (let from = begin; from < txCount; from += size) {
            promises.push(
              (async () => {
                const result = await this.TxHashes(address, from, size);
                const txHashes = result[0];
                const count = result[1];

                const acceptedEventsPromises = txHashes.map(async (hash) => {
                  const txDetails = await this.getTransactionDetail(hash);
                  return this.filterEvent(this.events, txDetails);
                });

                const events = await Promise.all(acceptedEventsPromises);
                const acceptedEvents = [].concat(...events); // Flatten the array of arrays.

                await getManager().transaction(async (entityManager) => {
                  await this.saveToDb(acceptedEvents, entityManager);
                  await this.saveCheckpoint(count, entityManager);
                });
              })()
            );
          }

          // Wait for all promises to resolve.
          await Promise.all(promises);
        })
      );
    }
  }

  async saveToDb(events: Event[], entityManager: EntityManager) { }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
