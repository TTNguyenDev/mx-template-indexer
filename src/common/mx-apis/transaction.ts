import { Config } from "../config";
import axios from "axios";
import axiosRetry from "axios-retry";

let config = new Config("./config/config.yaml");

// Configure retries for ETIMEDOUT error
axiosRetry(axios, {
  retries: 3, // Number of retries
  retryCondition: (error: any) => {
    // Retry on ETIMEDOUT error
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

export async function txCount(address: string): Promise<number> {
  const req = `${config.getApiUrl()}/accounts/${address}/transfers/count`;
  const response = await axios.get(req);
  return response.data;
}

export async function TxHashes(
  address: string,
  from: number,
  size: number,
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

export async function getTransactionDetail(hash: string): Promise<any> {
  const req = `${config.getApiUrl()}/transactions/${hash}`;
  const txResponse = await axios.get(req);
  return txResponse.data as any[];
}

export async function filterEvent(
  trackingEvent: string[],
  data: any,
): Promise<Event[] | undefined> {
  if (data.logs.events != undefined) {
    let events = data.logs.events;

    events = events.filter((v: any) => {
      let topic = Buffer.from(v.topics[0], "base64").toString("utf8");
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
