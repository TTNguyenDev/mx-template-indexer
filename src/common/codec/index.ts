import {
  AddressType,
  BigUIntType,
  BinaryCodec,
  U32Type,
  U8Type,
  U64Type,
} from "@multiversx/sdk-core/out";

export function decodeU32(str: string): number {
  return new BinaryCodec()
    .decodeTopLevel(Buffer.from(str, "base64"), new U32Type())
    .valueOf()
    .toFixed(0);
}

export function decodeU8(str: string): number {
  return new BinaryCodec()
    .decodeTopLevel(Buffer.from(str, "base64"), new U8Type())
    .valueOf()
    .toFixed(0);
}

export function decodeU64(str: string): number {
  return new BinaryCodec()
    .decodeTopLevel(Buffer.from(str, "base64"), new U64Type())
    .valueOf()
    .toFixed(0);
}

export function decodeBigUint(str: string): string {
  return new BinaryCodec()
    .decodeTopLevel(Buffer.from(str, "base64"), new BigUIntType())
    .valueOf()
    .toFixed(0)
    .toString();
}

export function decodeAddress(str: string): string {
  return new BinaryCodec()
    .decodeTopLevel(Buffer.from(str, "base64"), new AddressType())
    .valueOf()
    .bech32();
}

export function encodeBytes(bytes: Buffer): string {
  return bytes.toString("hex");
}

export function encodeArrayBytes(arr: Buffer[]): string[] {
  return arr.map((v: Buffer) => v.toString("hex"));
}
