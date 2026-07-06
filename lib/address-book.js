// lib/address-book.js - Local address book with custom labels.
//
// Features:
//   • Add addresses with custom names and notes
//   • Trust levels (trusted, neutral, blocked)
//   • Per-chain scoping
//   • Local-only storage — never leaves the user's browser
//   • Auto-import from public ENS names (read-only)
//
// Used by the popup to display human-readable names instead of raw 0x addresses.

const STORAGE_KEY = "wg_addressBook";
const DEFAULT_BOOK = { addresses: {} };

/**
 * Get the full address book. Async because chrome.storage is async.
 */
export async function getBook() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || DEFAULT_BOOK);
      });
    } else {
      resolve(DEFAULT_BOOK);
    }
  });
}

/**
 * Add or update an address entry.
 *
 * @param {string} address — 0x-prefixed EVM address
 * @param {Object} entry — { label, trust?, notes?, chainId?, tags? }
 *   trust: "trusted" | "neutral" | "blocked" (default "neutral")
 *   tags:  array of free-form strings (e.g. ["team", "personal"])
 */
export async function setAddress(address, entry) {
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    throw new Error("Invalid address");
  }
  if (!entry || !entry.label || typeof entry.label !== "string") {
    throw new Error("Label is required");
  }
  const book = await getBook();
  const key = address.toLowerCase();
  book.addresses[key] = {
    label: entry.label.slice(0, 64),
    trust: ["trusted", "neutral", "blocked"].includes(entry.trust) ? entry.trust : "neutral",
    notes: (entry.notes || "").slice(0, 500),
    chainId: entry.chainId || null,
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 10) : [],
    addedAt: book.addresses[key]?.addedAt || Date.now(),
    updatedAt: Date.now()
  };
  await _saveBook(book);
  return book.addresses[key];
}

/**
 * Remove an address from the book.
 */
export async function removeAddress(address) {
  const book = await getBook();
  const key = address.toLowerCase();
  delete book.addresses[key];
  await _saveBook(book);
}

/**
 * Get a single entry by address.
 */
export async function getAddress(address) {
  const book = await getBook();
  return book.addresses[address.toLowerCase()] || null;
}

/**
 * Check if an address is in the user's book and return its label.
 * Returns null if not found.
 */
export async function lookupLabel(address) {
  const entry = await getAddress(address);
  return entry ? entry.label : null;
}

/**
 * Check if an address is explicitly trusted or blocked by the user.
 * Returns "trusted" | "blocked" | "neutral" (unknown / not in book).
 */
export async function lookupTrust(address) {
  const entry = await getAddress(address);
  if (!entry) return "neutral";
  return entry.trust || "neutral";
}

/**
 * List all entries in the book, sorted by label.
 */
export async function listEntries(filter = {}) {
  const book = await getBook();
  let entries = Object.entries(book.addresses).map(([addr, e]) => ({
    address: addr,
    ...e
  }));
  if (filter.trust) entries = entries.filter(e => e.trust === filter.trust);
  if (filter.tag) entries = entries.filter(e => (e.tags || []).includes(filter.tag));
  if (filter.search) {
    const q = filter.search.toLowerCase();
    entries = entries.filter(e =>
      e.label.toLowerCase().includes(q) ||
      e.address.includes(q) ||
      (e.notes || "").toLowerCase().includes(q)
    );
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Export the address book as JSON. Useful for backup.
 */
export async function exportBook() {
  const book = await getBook();
  return JSON.stringify(book, null, 2);
}

/**
 * Import an address book from JSON. Merges with existing entries.
 * Existing entries with the same address are overwritten.
 */
export async function importBook(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error("Invalid JSON");
  }
  if (!parsed || !parsed.addresses || typeof parsed.addresses !== "object") {
    throw new Error("Invalid book format");
  }
  const current = await getBook();
  for (const [addr, entry] of Object.entries(parsed.addresses)) {
    if (addr.startsWith("0x") && addr.length === 42 && entry && entry.label) {
      current.addresses[addr.toLowerCase()] = {
        label: entry.label.slice(0, 64),
        trust: entry.trust || "neutral",
        notes: (entry.notes || "").slice(0, 500),
        chainId: entry.chainId || null,
        tags: entry.tags || [],
        addedAt: entry.addedAt || Date.now(),
        updatedAt: Date.now()
      };
    }
  }
  await _saveBook(current);
}

// ---------- Internal ----------

function _saveBook(book) {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: book }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    } else {
      resolve(); // no-op in Node tests
    }
  });
}

// Pure helpers (no storage) — usable in Node tests
export function normalizeAddress(address) {
  if (!address || typeof address !== "string") return null;
  const cleaned = address.trim().toLowerCase();
  if (!cleaned.startsWith("0x")) return null;
  if (cleaned.length !== 42) return null;
  if (!/^0x[0-9a-f]{40}$/.test(cleaned)) return null;
  return cleaned;
}

export function isValidEntry(entry) {
  return entry
    && typeof entry.label === "string"
    && entry.label.length > 0
    && entry.label.length <= 64;
}
