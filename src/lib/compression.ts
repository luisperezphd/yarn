import { useCallback, useEffect, useState } from "react";
import { Base64, arrayBufferToBase64, base64ToArrayBuffer } from "./base64";
import { useHashState } from "./util";

export async function compress(str: string, encoding = "gzip" as CompressionFormat): Promise<ArrayBuffer> {
  const byteArray = new TextEncoder().encode(str);
  const cs = new CompressionStream(encoding);
  const writer = cs.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  return new Response(cs.readable).arrayBuffer();
}

export async function compressToBase64(str: string, encoding = "gzip" as CompressionFormat): Promise<Base64> {
  return arrayBufferToBase64(await compress(str, encoding));
}

export async function decompressBase64(base64: Base64, encoding = "gzip" as CompressionFormat): Promise<string> {
  return await decompress(await base64ToArrayBuffer(base64), encoding);
}

export async function decompress(byteArray: ArrayBuffer, encoding = "gzip" as CompressionFormat): Promise<string> {
  const cs = new DecompressionStream(encoding);
  const writer = cs.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  const arrayBuffer = await new Response(cs.readable).arrayBuffer();
  return new TextDecoder().decode(arrayBuffer);
}
