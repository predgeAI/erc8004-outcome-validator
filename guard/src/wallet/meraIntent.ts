/** How the next Mera sign-in runs: create a new passkey, use the remembered one, or let the user pick. */
export const meraIntent: { mode: "create" | "get" | "pick" } = { mode: "get" };
