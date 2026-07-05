// lib/universal-router.js - Uniswap Universal Router command parser.
//
// Supported signatures:
//   0x3593564c - execute(bytes commands, bytes[] inputs, uint256 deadline)
//   0x248cbc34 - execute(bytes commands, bytes[] inputs)
//
// Reference: https://docs.uniswap.org/contracts/universal-router/technical-reference

import { strip0x } from "./decoder.js";
import { UR_COMMANDS } from "./constants.js";

const UR_METHODS = new Set(["0x3593564c", "0x248cbc34"]);

export function isUniversalRouter(methodId) {
  return UR_METHODS.has(methodId);
}

// Decode a single command byte -> { name, risk, desc } from UR_COMMANDS.
function describeCommand(byte) {
  return UR_COMMANDS[byte] || {
    name: `UNKNOWN(0x${byte.toString(16).padStart(2, "0")})`,
    risk: "MEDIUM",
    desc: "Unknown Universal Router command. Verify the dApp before proceeding."
  };
}

// Try to extract a human-readable hint from the input bytes of a command.
// Inputs are router-specific (mostly encoded swap routes); we surface the
// first 20 bytes worth of hex so users can at least see what each command touches.
function inputPreview(inputHex) {
  if (!inputHex || inputHex.length < 4) return "";
  // Take first 10 hex chars (5 bytes) as a hint — enough to spot addresses.
  return inputHex.slice(0, 20);
}

// Decode Universal Router execute(...).
// Returns { commands: [{ byte, name, risk, desc, inputPreview }], deadline }
export function decodeUniversalRouter(fullData) {
  const hex = strip0x(fullData);
  if (hex.length < 8) return null;

  // Determine deadline position based on which execute variant we have.
  // For 0x3593564c: args = (offset_cmd, offset_inputs, deadline)
  //   cmd offset at byte 4, inputs offset at byte 36, deadline at byte 68.
  // For 0x248cbc34: args = (offset_cmd, offset_inputs)
  //   cmd offset at byte 4, inputs offset at byte 36, no deadline.
  const cmdOffsetWord = hex.slice(8, 72);
  const inputsOffsetWord = hex.slice(72, 136);
  let cmdOffsetBytes, inputsOffsetBytes;
  try {
    cmdOffsetBytes = Number(BigInt("0x" + cmdOffsetWord)) * 2;
    inputsOffsetBytes = Number(BigInt("0x" + inputsOffsetWord)) * 2;
  } catch {
    return null;
  }

  // Bytes start at byte 4 (after selector). Offsets are relative to that point.
  const cmdStart = 8 + cmdOffsetBytes;
  const inputsStart = 8 + inputsOffsetBytes;

  // Read commands bytes
  if (cmdStart + 64 > hex.length) return null;
  const cmdLenWord = hex.slice(cmdStart, cmdStart + 64);
  let cmdLen;
  try { cmdLen = Number(BigInt("0x" + cmdLenWord)); } catch { return null; }
  const cmdBytesHex = hex.slice(cmdStart + 64, cmdStart + 64 + cmdLen * 2);

  // Read inputs[]
  if (inputsStart + 64 > hex.length) return null;
  const inputsLenWord = hex.slice(inputsStart, inputsStart + 64);
  let inputsLen;
  try { inputsLen = Number(BigInt("0x" + inputsLenWord)); } catch { return null; }

  // Each input is a dynamic bytes: (offset, length, data)
  const inputs = [];
  let cursor = inputsStart + 64;
  for (let i = 0; i < inputsLen; i++) {
    if (cursor + 64 > hex.length) break;
    const offW = hex.slice(cursor, cursor + 64);
    let offsetBytes;
    try { offsetBytes = Number(BigInt("0x" + offW)) * 2; } catch { break; }
    const dataStart = inputsStart + offsetBytes;
    if (dataStart + 64 > hex.length) break;
    const lenW = hex.slice(dataStart, dataStart + 64);
    let len;
    try { len = Number(BigInt("0x" + lenW)); } catch { break; }
    const inputHex = hex.slice(dataStart + 64, dataStart + 64 + len * 2);
    inputs.push(inputHex);
    const padded = Math.ceil(len / 32) * 32;
    cursor = Math.max(cursor + 64, dataStart + 64 + padded * 2);
  }

  // Parse command bytes (1 byte each)
  const commands = [];
  for (let i = 0; i < cmdLen; i++) {
    const byteHex = cmdBytesHex.slice(i * 2, i * 2 + 2);
    if (byteHex.length < 2) break;
    const byte = parseInt(byteHex, 16);
    const meta = describeCommand(byte);
    commands.push({
      byte,
      index: i,
      name: meta.name,
      risk: meta.risk,
      desc: meta.desc,
      inputPreview: inputPreview(inputs[i] || "")
    });
  }

  return { commands, inputs };
}
