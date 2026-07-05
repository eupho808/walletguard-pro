// lib/multicall-decoder.js - Recursive decoder for Multicall variants.
//
// Supported method signatures:
//   0xac9650d8 - multicall(bytes[] calldatas)                       - Multicall (V1)
//   0xee8b7563 - multicall(uint256 blockNumber, bytes[] calldatas)  - Multicall2
//   0x1745e9d0 - aggregate3((address,bool,bytes)[])                 - Multicall3
//   0x4b1f6190 - aggregate((address,bytes)[])                       - Multicall3
//   0x399960fc - tryAggregate(bool,(address,bytes)[])                - Multicall3
//   0xd1150700 - tryBlockAndAggregate(bool,uint256,(address,bytes)[])
//   0x3975e40a - aggregate3Value((address,bool,uint256,bytes)[])    - Multicall3

import { strip0x } from "./decoder.js";

const MULTICALL_METHODS = new Set([
  "0xac9650d8", "0xee8b7563", "0x1745e9d0",
  "0x4b1f6190", "0x399960fc", "0xd1150700", "0x3975e40a"
]);

export function isMulticall(methodId) {
  return MULTICALL_METHODS.has(methodId);
}

// ---------- Helpers ----------

function readWord(hex, pos) {
  if (pos + 64 > hex.length) return { value: null, next: pos };
  return { value: hex.slice(pos, pos + 64), next: pos + 64 };
}

// ---------- Decoders ----------

// Decode multicall(bytes[]) - 0xac9650d8
// Layout: [selector][offset=0x20][length][for each: offset, length, data]
function decodeMulticallV1(hex) {
  const lengthWord = hex.slice(64, 128);
  let length;
  try { length = Number(BigInt("0x" + lengthWord)); } catch { return []; }

  const calls = [];
  let cursor = 128;
  for (let i = 0; i < length; i++) {
    if (cursor + 64 > hex.length) break;
    const offsetWord = hex.slice(cursor, cursor + 64);
    let offsetBytes;
    try { offsetBytes = Number(BigInt("0x" + offsetWord)) * 2; } catch { break; }
    // Offsets inside a bytes[] point from the start of the array argument
    // (which is at hex position 64 in this calldata layout).
    const dataStart = 64 + offsetBytes;
    if (dataStart + 64 > hex.length) break;

    const lenWord = hex.slice(dataStart, dataStart + 64);
    let callLen;
    try { callLen = Number(BigInt("0x" + lenWord)); } catch { break; }
    const callHex = hex.slice(dataStart + 64, dataStart + 64 + callLen * 2);
    if (callHex.length >= 8) calls.push("0x" + callHex);

    const padded = Math.ceil(callLen / 32) * 32;
    cursor = Math.max(cursor + 64, dataStart + 64 + padded * 2);
  }
  return calls;
}

// Decode multicall(uint256 blockNumber, bytes[] calldatas) - 0xee8b7563
// The uint256 sits at the start, then bytes[] follows.
function decodeMulticallWithBlock(hex) {
  // bytes[] starts at position 64 (after the uint256).
  // Inside the bytes[], the first word is the offset (always 0x20 = 64 bytes = 128 hex chars).
  const offsetWord = hex.slice(64, 128);
  let arrOffset;
  try { arrOffset = Number(BigInt("0x" + offsetWord)) * 2; } catch { return []; }
  // arrOffset is from start of the bytes[] argument (position 64 in the original calldata).
  const lengthStart = 64 + arrOffset;
  if (lengthStart + 64 > hex.length) return [];
  const lengthWord = hex.slice(lengthStart, lengthStart + 64);
  let length;
  try { length = Number(BigInt("0x" + lengthWord)); } catch { return []; }

  const calls = [];
  let cursor = lengthStart + 64;
  for (let i = 0; i < length; i++) {
    if (cursor + 64 > hex.length) break;
    const offW = hex.slice(cursor, cursor + 64);
    let offsetBytes;
    try { offsetBytes = Number(BigInt("0x" + offW)) * 2; } catch { break; }
    const dataStart = lengthStart + offsetBytes;
    if (dataStart + 64 > hex.length) break;
    const lenWord = hex.slice(dataStart, dataStart + 64);
    let callLen;
    try { callLen = Number(BigInt("0x" + lenWord)); } catch { break; }
    const callHex = hex.slice(dataStart + 64, dataStart + 64 + callLen * 2);
    if (callHex.length >= 8) calls.push("0x" + callHex);
    const padded = Math.ceil(callLen / 32) * 32;
    cursor = Math.max(cursor + 64, dataStart + 64 + padded * 2);
  }
  return calls;
}

// Decode aggregate3((address,bool,bytes)[]) - 0x1745e9d0
// Also handles aggregate (0x4b1f6190), tryAggregate (0x399960fc),
// tryBlockAndAggregate (0xd1150700), aggregate3Value (0x3975e40a).
function decodeAggregate3(hex) {
  const lengthWord = hex.slice(64, 128);
  let length;
  try { length = Number(BigInt("0x" + lengthWord)); } catch { return []; }

  const headsStart = 136; // in hex chars (selector=8 + offset=64 + length=64)
  const heads = [];
  for (let i = 0; i < length; i++) {
    // Each head is 96 bytes = 192 hex chars.
    const headPos = headsStart + i * 192;
    if (headPos + 192 > hex.length) break;
    // Address occupies the last 20 bytes (40 hex chars) of the first 32-byte word.
    const address = "0x" + hex.slice(headPos + 24, headPos + 64);
    // Bool is the second 32-byte word.
    const successWord = hex.slice(headPos + 64, headPos + 128);
    // Offset is the third 32-byte word (in bytes from head start).
    const offsetWord = hex.slice(headPos + 128, headPos + 192);
    let bytesOffsetBytes;
    try { bytesOffsetBytes = Number(BigInt("0x" + offsetWord)); } catch { continue; }
    const bytesOffset = bytesOffsetBytes * 2; // convert bytes to hex chars
    heads.push({ headPos, address, successWord, bytesOffset });
  }

  const calls = [];
  for (const h of heads) {
    const tailStart = h.headPos + h.bytesOffset;
    if (tailStart + 64 > hex.length) continue;
    const lenWord = hex.slice(tailStart, tailStart + 64);
    let callLen;
    try { callLen = Number(BigInt("0x" + lenWord)); } catch { continue; }
    const callHex = hex.slice(tailStart + 64, tailStart + 64 + callLen * 2);
    if (callHex.length >= 8) {
      calls.push({
        target: h.address,
        data: "0x" + callHex
      });
    }
  }
  return calls;
}

// ---------- Top-level entry ----------

// Returns an array of { target, data } objects for inner calls in a multicall.
// `target` may be null for V1 multicall where per-call addresses aren't encoded.
// Empty array if the method is not recognized or decoding fails.
export function extractInnerCalls(methodId, fullData) {
  const hex = strip0x(fullData);
  if (hex.length < 8) return [];

  try {
    if (methodId === "0xac9650d8") return decodeMulticallV1(hex).map((c) => ({ target: null, data: c }));
    if (methodId === "0xee8b7563") return decodeMulticallWithBlock(hex).map((c) => ({ target: null, data: c }));
    if (MULTICALL_METHODS.has(methodId)) return decodeAggregate3(hex);
  } catch (e) {
    console.warn("WalletGuard: multicall decode failed:", e);
  }
  return [];
}
