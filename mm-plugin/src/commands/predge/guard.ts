import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { RISK_LEVELS } from "../../core/check.js";
import { guard, type GuardReport, renderGuard } from "../../core/guard.js";
import { hostClients, toCommandError } from "../../host.js";

const inputs = {
  market: {
    type: InputFieldType.Text,
    flag: "market",
    message: "Polymarket market id, slug, condition id, or polymarket.com URL",
    required: true,
    index: 0,
  },
  side: {
    type: InputFieldType.Text,
    flag: "side",
    message: "Outcome to trade: YES, NO, or an outcome label such as Over",
    required: true,
  },
  size: {
    type: InputFieldType.Text,
    flag: "size",
    message: "Order size in shares",
    required: true,
  },
  action: {
    type: InputFieldType.Select,
    flag: "action",
    message: "buy or sell the outcome (default buy)",
    required: false,
    prompt: false,
    options: [{ value: "buy", label: "buy" }, { value: "sell", label: "sell" }],
  },
  price: {
    type: InputFieldType.Text,
    flag: "price",
    message: "Worst price per share (0..1); default the current best ask (buy) or bid (sell)",
    required: false,
    prompt: false,
  },
  maxRisk: {
    type: InputFieldType.Select,
    flag: "max-risk",
    message: "Highest settlement risk the guard accepts (default ok)",
    required: false,
    prompt: false,
    options: RISK_LEVELS.map((v) => ({ value: v, label: v })),
  },
} satisfies InputSchema;

export default class PredgeGuard extends PluginCommand<GuardReport> {
  static override description =
    "Gate a Polymarket order on settlement risk: runs predge check and, only if safe, prints the exact mm predict quote and place commands. Refuses (non-zero exit) otherwise. Never places an order.";
  static override examples = [
    "<%= config.bin %> predge guard will-trump-say-ammunition-this-week-20261011 --side YES --size 10",
    "<%= config.bin %> predge guard 5635889 --side NO --size 25 --price 0.97",
  ];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "predge:guard";

  async execute(io: CommandIO): Promise<GuardReport> {
    const { market, side, size, action, price, maxRisk } = await io.resolveInputs(inputs);
    let g: GuardReport;
    try {
      g = await guard(market, {
        side,
        size: Number(size),
        action: (action || "buy") as "buy" | "sell",
        price: price ? Number(price) : undefined,
        maxRisk: (maxRisk || "ok") as GuardReport["check"]["maxRisk"],
        clients: hostClients(this.ctx.publicClient as never),
      });
    } catch (e) {
      throw toCommandError(e, "PREDGE_GUARD_FAILED", "Unknown is not safe: do not place this order until the guard succeeds.");
    }
    if (!g.allowed) {
      throw new CommandError("PREDGE_GUARD_REFUSED", `Refused: ${g.reason}`, `Do not run mm predict place for market ${g.check.market.id}. Re-run mm predge check ${g.check.market.id} later.`);
    }
    return g;
  }

  override successHint(data: GuardReport): string {
    return renderGuard(data);
  }
}
