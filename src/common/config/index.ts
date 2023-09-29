import * as yaml from "js-yaml";
import * as fs from "fs";

export class Config {
  data: Record<string, any>;
  constructor(filename: string) {
    this.data = yaml.load(fs.readFileSync(filename, "utf8")) as Record<
      string,
      any
    >;
  }

  getApiUrl(): string {
    const apiUrl = this.data.urls.api;
    if (!apiUrl) {
      throw new Error("No API url present");
    }

    return apiUrl;
  }

  getContractAbiPath(key: string): string {
    console.log(`Contract ABI path: ${this.data["abi"][key][0]}`);
    const contractApiPath = this.data["abi"][key][0];
    if (!contractApiPath) {
      throw new Error(`No contract abi path present - ${key}`);
    }
    return contractApiPath;
  }

  getContractAddress(key: string): string[] {
    const contractAddress = this.data["wallet"][key];
    if (!contractAddress) {
      throw new Error(`No contract address present - ${key}`);
    }
    return contractAddress;
  }

  getBatchSize(): number {
    const batchSize = this.data["batchSize"];
    if (!batchSize) {
      throw new Error(`No batchsize config present`);
    }
    return batchSize;
  }

  getDbConfig(key: string): any {
    const config = this.data["database"][key];
    if (!config) {
      throw new Error(`No Db config - ${key}`);
    }
    return config;
  }
}
