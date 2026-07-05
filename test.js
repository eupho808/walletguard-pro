// test.js - Test scenarios that dispatch WalletGuardShowUI events directly.
// No real wallet needed.

// ============================================================
// ABI ENCODING HELPERS
// ============================================================

function pad32(hex) {
  // Pad hex string to 64 chars (32 bytes) from the LEFT.
  hex = hex.replace(/^0x/, "");
  return hex.padStart(64, "0");
}

function addrToWord(addr) {
  return pad32(addr.replace(/^0x/, "").toLowerCase());
}

function uintToWord(n) {
  let hex;
  if (typeof n === "bigint") hex = n.toString(16);
  else hex = BigInt(n).toString(16);
  return hex.padStart(64, "0");
}

function boolToWord(b) {
  return b ? uintToWord(1) : uintToWord(0);
}

function hexConcat(...parts) {
  return "0x" + parts.map((p) => p.replace(/^0x/, "")).join("");
}

// Encode a "bytes" payload: (uint256 offset, uint256 length, bytes data)
// Used inside tuples where bytes is dynamic.
function encodeBytesDynamic(bytesHex) {
  bytesHex = bytesHex.replace(/^0x/, "");
  const length = bytesHex.length / 2;
  const padded = bytesHex.padEnd(Math.ceil(length / 32) * 32 * 2, "0");
  return uintToWord(length) + padded;
}

// ============================================================
// METHOD ENCODERS
// ============================================================

function encodeApprove(spender, amount) {
  return hexConcat("0x095ea7b3", addrToWord(spender), uintToWord(amount));
}

function encodeTransfer(to, amount) {
  return hexConcat("0xa9059cbb", addrToWord(to), uintToWord(amount));
}

function encodeSetApprovalForAll(operator, approved) {
  return hexConcat("0xa22cb465", addrToWord(operator), boolToWord(approved));
}

function encodeTransferFrom(from, to, amount) {
  return hexConcat("0x23b872dd", addrToWord(from), addrToWord(to), uintToWord(amount));
}

// Multicall3 aggregate3((address,bool,bytes)[])
// subcalls: [{ target, allowFailure, callData }]
function encodeMulticall3(subcalls) {
  // Each tuple head: address(32) + bool(32) + offset(32)  =  96 bytes
  // Each tuple tail: bytes length(32) + bytes data
  const heads = [];
  const tails = [];

  // First pass: build tails to know their sizes.
  for (const sc of subcalls) {
    const callHex = sc.callData.replace(/^0x/, "");
    const callLen = callHex.length / 2;
    const padded = callHex.padEnd(Math.ceil(callLen / 32) * 32 * 2, "0");
    tails.push({ hex: uintToWord(callLen) + padded, size: Math.ceil(callLen / 32) * 32 + 32 });
  }

  // Calculate each tuple's tail offset.
  // Layout: head[0] head[1] ... head[n-1] tail[0] tail[1] ... tail[n-1]
  // head[i] starts at byte i*96 from heads-base
  // tail[i] starts at byte n*96 + sum(tail[0..i-1] sizes) from heads-base
  // offset in head[i] = (tail[i] start) - (head[i] start)
  //                  = (n - i) * 96 + sum(tail[0..i-1] sizes)

  const n = subcalls.length;
  let prevTailsSize = 0;
  for (let i = 0; i < n; i++) {
    const offset = (n - i) * 96 + prevTailsSize;
    heads.push(
      addrToWord(subcalls[i].target) +
      boolToWord(subcalls[i].allowFailure) +
      uintToWord(offset)
    );
    prevTailsSize += tails[i].size;
  }

  return hexConcat(
    "0x1745e9d0",
    uintToWord(0x20),
    uintToWord(n),
    heads.join(""),
    tails.map((t) => t.hex).join("")
  );
}

// Universal Router execute(bytes commands, bytes[] inputs, uint256 deadline)
// cmds: array of byte numbers (1 byte each)
function encodeUniversalRouter(cmds, inputs, withDeadline = true) {
  // commands: dynamic bytes
  const cmdBytes = "0x" + cmds.map((c) => c.toString(16).padStart(2, "0")).join("");

  // inputs: bytes[] of dynamic bytes
  // Each input is offset (32) + length (32) + data (padded)
  // For each input i, the offset is from start of inputs array

  // Build tails for each input
  const inputTails = inputs.map((inputHex) => {
    inputHex = inputHex.replace(/^0x/, "");
    const len = inputHex.length / 2;
    const padded = inputHex.padEnd(Math.ceil(len / 32) * 32 * 2, "0");
    return uintToWord(len) + padded;
  });

  // Offsets array: each is offset from start of inputs block to its tail
  // Inputs block starts with the length word, then offset words, then tails
  // Wait, actually: inputs is bytes[] so:
  //   offset (32) -> length (32) -> [offset_0 (32), offset_1 (32), ...] -> [len_0 + data_0, len_1 + data_1, ...]
  //
  // Each input's offset points from start of inputs block (which is at inputsStartArg).
  // inputsStartArg = arg position 1 (for 0x3593564c: (cmd, inputs, deadline))
  //                = arg position 0 (for 0x248cbc34: (cmd, inputs))

  // Total tail bytes
  const totalTailBytes = inputTails.reduce((sum, t) => sum + t.length / 2, 0);

  // Offset array (each entry: offset from inputs-block-start to the corresponding tail)
  // The first tail starts at: 32 (length) + 32*n (offset array)
  const offsets = [];
  let running = 32 + 32 * inputs.length; // bytes offset
  for (let i = 0; i < inputs.length; i++) {
    offsets.push(uintToWord(running));
    running += inputTails[i].length / 2;
  }

  const inputsBlock =
    uintToWord(inputs.length) +
    offsets.join("") +
    inputTails.join("");

  // commands block
  const cmdHex = cmdBytes.replace(/^0x/, "");
  const cmdLen = cmdHex.length / 2;
  const cmdBlock =
    uintToWord(cmdLen) +
    cmdHex.padEnd(Math.ceil(cmdLen / 32) * 32 * 2, "0");

  // Final layout:
  //   [selector]
  //   [offset_to_commands] [offset_to_inputs] [deadline (optional)]
  //   [commands block] [inputs block]

  // offsets are from start of args (byte 4)
  // arg[0] = commands (32-byte offset)
  // arg[1] = inputs (32-byte offset)
  // arg[2] = deadline (32 bytes, only for 3-arg variant)

  const argsSize = withDeadline ? 3 : 2;
  const cmdStart = argsSize * 32; // commands block starts right after args
  const inputsStart = cmdStart + cmdBlock.length / 2;

  const header = withDeadline
    ? uintToWord(cmdStart) + uintToWord(inputsStart) + uintToWord(99999999999n)
    : uintToWord(cmdStart) + uintToWord(inputsStart);

  const selector = withDeadline ? "0x3593564c" : "0x248cbc34";

  return hexConcat(selector, header, cmdBlock, inputsBlock);
}

// ============================================================
// CONSTANTS
// ============================================================

const UNISWAP_V2 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const SCAMMER = "0xbad5cabbea123456789012345678901234567890";
const NFT_OPERATOR = "0x6a627842abcdef12345678901234567890123456";
const RECIPIENT = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";

// USDC address (6 decimals), DAI (18 decimals)
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

// ============================================================
// TEST SCENARIOS
// ============================================================

function fireUI(payload) {
  const event = new CustomEvent("WalletGuardShowUI", {
    detail: { ...payload, timestamp: Date.now() }
  });
  window.dispatchEvent(event);
}

const tests = {
  // ---------- Approves ----------
  "approve-safe": () => fireUI({
    to: UNISWAP_V2,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: encodeApprove(UNISWAP_V2, 1000000000n), // 1000 USDC (6 dec)
    method: "eth_sendTransaction"
  }),

  "approve-unknown-limited": () => fireUI({
    to: SCAMMER,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: encodeApprove(SCAMMER, 1000000000000000000n), // 1 token
    method: "eth_sendTransaction"
  }),

  "approve-unlimited-unknown": () => fireUI({
    to: SCAMMER,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    // uint256 max = 2^256 - 1
    data: encodeApprove(SCAMMER, (1n << 256n) - 1n),
    method: "eth_sendTransaction"
  }),

  "approval-for-all-unknown": () => fireUI({
    to: NFT_OPERATOR,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: encodeSetApprovalForAll(NFT_OPERATOR, true),
    method: "eth_sendTransaction"
  }),

  // ---------- ETH ----------
  "eth-safe": () => fireUI({
    to: UNISWAP_V2,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x16345785d8a0000", // 0.1 ETH
    data: "0x",
    method: "eth_sendTransaction"
  }),

  "eth-unknown-small": () => fireUI({
    to: SCAMMER,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x6f05b59d3b20000", // 0.5 ETH
    data: "0x",
    method: "eth_sendTransaction"
  }),

  "eth-unknown-large": () => fireUI({
    to: SCAMMER,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x8AC7230489E80000", // 10 ETH
    data: "0x",
    method: "eth_sendTransaction"
  }),

  // ---------- Permits & signatures ----------
  "permit-unlimited": () => fireUI({
    to: "0xUser0000000000000000000000000000000000001",
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: "0x",
    isEIP712: true,
    method: "eth_signTypedData_v4",
    permitDetails: {
      primaryType: "Permit",
      tokenName: "USDC",
      spender: shortAddr(SCAMMER),
      spenderFull: SCAMMER,
      value: (1n << 256n - 1n).toString(), // unlimited
      deadline: new Date(Date.now() + 86400000 * 30).toLocaleString()
    }
  }),

  "permit-limited": () => fireUI({
    to: "0xUser0000000000000000000000000000000000001",
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: "0x",
    isEIP712: true,
    method: "eth_signTypedData_v4",
    permitDetails: {
      primaryType: "Permit",
      tokenName: "DAI",
      spender: shortAddr(UNISWAP_V2),
      spenderFull: UNISWAP_V2,
      value: "1000000000000000000", // 1 DAI
      deadline: new Date(Date.now() + 86400000 * 30).toLocaleString()
    }
  }),

  "personal-sign": () => fireUI({
    to: "0xUser0000000000000000000000000000000000001",
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: "0x",
    isPersonalSign: true,
    method: "personal_sign",
    messageText: "Welcome to ExampleDApp. Click to sign in. This signature is used only for authentication and does not authorize any transactions."
  }),

  // ---------- Multicall ----------
  "multicall-safe": () => {
    // Two ERC-20 transfers to known contracts
    const sub1 = {
      target: USDC,
      allowFailure: true,
      callData: encodeTransfer(RECIPIENT, 500000000n) // 500 USDC
    };
    const sub2 = {
      target: DAI,
      allowFailure: true,
      callData: encodeTransfer(RECIPIENT, 1000000000000000000n) // 1 DAI
    };
    fireUI({
      to: "0xcA11bde05977b3631167028862bE2a173976CA11", // Multicall3
      from: "0xUser0000000000000000000000000000000000001",
      value: "0x0",
      data: encodeMulticall3([sub1, sub2]),
      method: "eth_sendTransaction"
    });
  },

  "multicall-drainer": () => {
    // Approve scammer + TransferFrom drainer pattern
    const sub1 = {
      target: USDC,
      allowFailure: false,
      callData: encodeApprove(SCAMMER, (1n << 256n) - 1n) // unlimited approve
    };
    const sub2 = {
      target: USDC,
      allowFailure: false,
      callData: encodeTransferFrom(
        "0xUser0000000000000000000000000000000000001",
        SCAMMER,
        100000000000n // drain all USDC (100k USDC)
      )
    };
    fireUI({
      to: "0xcA11bde05977b3631167028862bE2a173976CA11",
      from: "0xUser0000000000000000000000000000000000001",
      value: "0x0",
      data: encodeMulticall3([sub1, sub2]),
      method: "eth_sendTransaction"
    });
  },

  // ---------- Universal Router ----------
  "ur-wrap": () => {
    // Just WRAP_ETH (0x0a): input = (recipient, amountMin)
    const input = hexConcat(addrToWord(RECIPIENT), uintToWord(0));
    fireUI({
      to: "0xef1c6e67703c7bd71d701e3008ed740d79d164b0", // Universal Router
      from: "0xUser0000000000000000000000000000000000001",
      value: "0x16345785d8a0000", // 0.1 ETH
      data: encodeUniversalRouter([0x0a], [input], true),
      method: "eth_sendTransaction"
    });
  },

  "ur-swap": () => {
    // WRAP_ETH then V3_SWAP_EXACT_IN (0x00): input for V3_SWAP_EXACT_IN = (recipient, amountIn, amountOutMin, path, payerIsUser)
    const wrapInput = hexConcat(addrToWord(RECIPIENT), uintToWord(0));
    const swapInput = hexConcat(
      addrToWord(RECIPIENT),  // recipient
      uintToWord(100000000000000000n), // amountIn = 0.1 ETH
      uintToWord(0),          // amountOutMin (no slippage check in test)
      uintToWord(160)         // path offset (placeholder)
    );
    fireUI({
      to: "0xef1c6e67703c7bd71d701e3008ed740d79d164b0",
      from: "0xUser0000000000000000000000000000000000001",
      value: "0x16345785d8a0000",
      data: encodeUniversalRouter([0x0a, 0x00], [wrapInput, swapInput], true),
      method: "eth_sendTransaction"
    });
  },

  "ur-permit2": () => {
    // PERMIT2_TRANSFER_FROM (0x02): input = encoded Permit2 transferFrom details
    const input = hexConcat(
      addrToWord(USDC),                  // token
      addrToWord(SCAMMER),               // recipient
      uintToWord(1000000000000n)         // amount
    );
    fireUI({
      to: "0xef1c6e67703c7bd71d701e3008ed740d79d164b0",
      from: "0xUser0000000000000000000000000000000000001",
      value: "0x0",
      data: encodeUniversalRouter([0x02], [input], true),
      method: "eth_sendTransaction"
    });
  },

  // ---------- Tools ----------
  "phishing-test": () => {
    window.dispatchEvent(new CustomEvent("WalletGuardTestPhishing", {
      detail: { domain: "fake-metamask-claim.io" }
    }));
  },

  // ---------- Typosquatting ----------
  "typosquat-distance-2": () => fireUI({
    to: "0xScammer0000000000000000000000000000000001",
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: encodeApprove("0xScammer0000000000000000000000000000000001", (1n << 256n) - 1n),
    method: "eth_sendTransaction",
    hostname: "unisvvap.org"
  }),

  "typosquat-distance-1": () => fireUI({
    to: "0xScammer0000000000000000000000000000000001",
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: encodeApprove("0xScammer0000000000000000000000000000000001", (1n << 256n) - 1n),
    method: "eth_sendTransaction",
    hostname: "uniswapp.org"
  }),

  "typosquat-subdomain-attack": () => fireUI({
    to: "0xScammer0000000000000000000000000000000001",
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: encodeApprove("0xScammer0000000000000000000000000000000001", (1n << 256n) - 1n),
    method: "eth_sendTransaction",
    hostname: "uniswap.org.evil.com"
  }),

  "typosquat-trusted-site": () => fireUI({
    to: UNISWAP_V2,
    from: "0xUser0000000000000000000000000000000000001",
    value: "0x0",
    data: encodeApprove(UNISWAP_V2, (1n << 256n) - 1n),
    method: "eth_sendTransaction",
    hostname: "app.uniswap.org"
  }),

  "check-bg": async () => {
    try {
      const res = await chrome.runtime.sendMessage({ action: "getPopupData" });
      console.log("Background response:", res);
      alert("Background OK. See console for response:\n" + JSON.stringify(res?.stats || {}, null, 2));
    } catch (e) {
      console.error("Background connection failed:", e);
      alert("Background not reachable: " + e.message);
    }
  },

  "scan-vitalik": async () => {
    // vitalik.eth public address - has many historic approvals.
    const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    try {
      const res = await chrome.runtime.sendMessage({ action: "rescanApprovals", address: addr });
      if (res?.error) {
        alert("Scan failed: " + res.error);
        return;
      }
      const s = res.scan?.summary || {};
      console.log("Approval scan complete:", res.scan);
      alert(
        "Scan complete for " + addr + ":\n" +
        "Chain: " + (res.scan?.chainName || "?") + "\n" +
        "Total: " + s.total + "\n" +
        "Risky: " + s.risky + "\n" +
        "Unlimited: " + s.unlimited + "\n\n" +
        "Open the WalletGuard popup to see the full list."
      );
    } catch (e) {
      alert("Scan failed: " + e.message);
    }
  }
};

// ============================================================
// BIND BUTTONS
// ============================================================

function shortAddr(a) {
  if (!a || a.length < 10) return a || "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-test]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.test;
      console.log(`Running test: ${name}`);
      try {
        tests[name]();
      } catch (e) {
        console.error(`Test ${name} failed:`, e);
        alert(`Test failed: ${e.message}`);
      }
    });
  });
});
