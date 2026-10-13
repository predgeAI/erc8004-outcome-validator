import { useCallback, useEffect, useRef, useState } from "react";
import { createSecp256k1SigningSession, type Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { createWalletClient, http, type Hex } from "viem";
import { client, monadTestnet } from "../lib/chain";
import { MONAD } from "../lib/constants";
import type { HostProps } from "./config";
import { deriveEvmKey } from "./meraKeys";
import { createPasskey, forgetCredential, getPrf, passkeyError } from "./passkey";
import type { ReceiptTypedData } from "./receipt";
import { meraIntent } from "./meraIntent";

/**
 * Mera as the account layer: the passkey's account namespace is a BIP-44 EOA on Monad testnet.
 *
 * Session design: one passkey prompt opens a signing session that signs receipts and transactions
 * without further prompts. It ends after 10 minutes without use or 30 minutes in total, or on
 * "Lock now"; the key is zeroed by session.end(). The next signature re-prompts once.
 * Only the public address and credential id are kept in this browser.
 */
export const SESSION_IDLE_MS = 10 * 60_000;
export const SESSION_MAX_MS = 30 * 60_000;
const ADDR_KEY = "guard.mera.address";


const loadAddr = (): `0x${string}` | null => { try { const a = localStorage.getItem(ADDR_KEY); return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : null; } catch { return null; } };
const saveAddr = (a: string | null) => { try { if (a) localStorage.setItem(ADDR_KEY, a); else localStorage.removeItem(ADDR_KEY); } catch { /* ignore */ } };

export default function MeraHost({ onChange, autoLogin }: HostProps) {
  const [address, setAddress] = useState<`0x${string}` | null>(loadAddr);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [tick, setTick] = useState(0);
  const session = useRef<{ s: Secp256k1SigningSession; opened: number; used: number } | null>(null);
  const asked = useRef(false);

  const lock = useCallback(() => {
    session.current?.s.end();
    session.current = null;
    setEndsAt(null);
  }, []);

  const open = useCallback(async (mode: "create" | "get" | "pick") => {
    setError(null);
    const r = mode === "create" ? await createPasskey("account") : await getPrf("account", { pick: mode === "pick" });
    const key = deriveEvmKey(r.prfOutput);
    r.prfOutput.fill(0);
    lock();
    const s = createSecp256k1SigningSession({ privateKey: key });
    key.fill(0);
    const now = Date.now();
    session.current = { s, opened: now, used: now };
    const a = toViemAccount(s).address;
    setAddress(a);
    saveAddr(a);
    setEndsAt(Math.min(now + SESSION_IDLE_MS, now + SESSION_MAX_MS));
    return s;
  }, [lock]);

  /** Returns a live session, re-prompting once if it ended. */
  const live = useCallback(async () => {
    const cur = session.current;
    const now = Date.now();
    if (cur && now - cur.used < SESSION_IDLE_MS && now - cur.opened < SESSION_MAX_MS) {
      cur.used = now;
      setEndsAt(Math.min(now + SESSION_IDLE_MS, cur.opened + SESSION_MAX_MS));
      return cur.s;
    }
    return open("get");
  }, [open]);

  // expiry timer
  useEffect(() => {
    if (!endsAt) return;
    const id = setTimeout(lock, Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [endsAt, lock]);
  useEffect(() => () => { session.current?.s.end(); }, []);

  const login = useCallback(() => {
    const mode = meraIntent.mode;
    meraIntent.mode = "get";
    open(mode).catch((e) => setError(passkeyError(e)));
  }, [open]);

  useEffect(() => {
    if (autoLogin && !asked.current) { asked.current = true; login(); }
  }, [autoLogin, login]);

  useEffect(() => {
    let alive = true;
    setBalance(null);
    if (!address) return;
    client.getBalance({ address }).then((b) => { if (alive) setBalance(b); }).catch(() => {});
    return () => { alive = false; };
  }, [address, tick]);
  const refreshBalance = useCallback(() => setTick((x) => x + 1), []);

  useEffect(() => {
    onChange({
      kind: "mera",
      ready: true,
      authenticated: Boolean(address),
      address,
      walletLabel: "Mera passkey account",
      login,
      logout: async () => { lock(); saveAddr(null); forgetCredential(); setAddress(null); },
      getWalletClient: async () => createWalletClient({ account: toViemAccount(await live()), chain: monadTestnet, transport: http(MONAD.rpc) }),
      error,
      embedded: true,
      balance,
      refreshBalance,
      signVia: "Mera signing session (toViemAccount)",
      signTypedData: async (td: ReceiptTypedData) => {
        try { return await toViemAccount(await live()).signTypedData(td); } catch (e) { throw new Error(passkeyError(e)); }
      },
      sendVia: "Mera signing session (viem sendTransaction)",
      sendTx: async ({ to, data }) => {
        const wc = createWalletClient({ account: toViemAccount(await live()), chain: monadTestnet, transport: http(MONAD.rpc) });
        return wc.sendTransaction({ to, data, chain: monadTestnet }) as Promise<Hex>;
      },
      extras: [
        ...(endsAt ? [{ id: "mera-lock", label: "Lock now (end signing session)", run: lock }] : [{ id: "mera-unlock", label: "Unlock signing (one passkey prompt)", run: () => { open("get").catch((e) => setError(passkeyError(e))); } }]),
      ],
      sessionEndsAt: endsAt,
    });
  }, [address, endsAt, error, balance, refreshBalance, login, lock, live, open, onChange]);

  return null;
}

