// Glue between the mm host and the core: chain clients and error mapping.

import { CommandError } from "@metamask/agent-wallet/plugin";
import type { ClientFactory, ReadClient } from "./core/verdict.js";
import { publicRpcFactory } from "./core/verdict.js";

/**
 * Prefer the host's RPC gateway (ctx.publicClient, granted by wallet-read). If the host cannot give
 * a client for the chain (not signed in, chain not served), fall back to Monad's public RPC. Either
 * way the read is an eth_call; nothing is signed or sent.
 */
export function hostClients(publicClient: ((chainId: number) => unknown) | undefined): ClientFactory {
  const fallback = publicRpcFactory();
  return (chainId) => {
    let why = "ctx.publicClient not available";
    if (publicClient) {
      try {
        const client = publicClient(chainId) as ReadClient | undefined;
        if (client && typeof client.readContract === "function") return { client, via: `mm host RPC (ctx.publicClient(${chainId}))` };
        why = "ctx.publicClient returned no client";
      } catch (e) {
        why = `ctx.publicClient(${chainId}) failed: ${(e as Error).message.split("\n")[0].slice(0, 160)}`;
      }
    }
    const fb = fallback(chainId);
    return { client: fb.client, via: `${fb.via} (${why})` };
  };
}

export function toCommandError(e: unknown, code: string, hint: string): CommandError {
  if (e instanceof CommandError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new CommandError(code, msg.split("\n")[0].slice(0, 400), hint);
}
