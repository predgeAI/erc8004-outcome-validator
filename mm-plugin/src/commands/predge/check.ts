import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { check, type CheckReport, RISK_LEVELS, renderCheck } from "../../core/check.js";
import { hostClients, toCommandError } from "../../host.js";

const inputs = {
  market: {
    type: InputFieldType.Text,
    flag: "market",
    message: "Polymarket market id, slug, condition id, or polymarket.com URL",
    required: true,
    index: 0,
  },
  maxRisk: {
    type: InputFieldType.Select,
    flag: "max-risk",
    message: "Highest settlement risk that still counts as safe",
    required: false,
    prompt: false,
    options: RISK_LEVELS.map((v) => ({ value: v, label: v })),
  },
  noChain: {
    type: InputFieldType.Boolean,
    flag: "no-chain",
    message: "Skip the Monad verdict read",
    required: false,
    prompt: false,
    default: false,
  },
} satisfies InputSchema;

export default class PredgeCheck extends PluginCommand<CheckReport> {
  static override description =
    "Check a Polymarket market's UMA settlement risk before trading: signed Predge record (ed25519, pinned key), dispute timeline, disputed proposal vs outcome, and Predge's verdict on Monad.";
  static override examples = [
    "<%= config.bin %> predge check 1137824",
    "<%= config.bin %> predge check will-trump-say-ammunition-this-week-20261011",
    "<%= config.bin %> predge check 0xddff7251af9c56b2048edd2513019e55ae104143faa97d5799978f926bfcf1e0 --json",
    "<%= config.bin %> predge check 1112268 --max-risk resolved",
  ];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "predge:check";

  async execute(io: CommandIO): Promise<CheckReport> {
    const { market, maxRisk, noChain } = await io.resolveInputs(inputs);
    try {
      return await check(market, { maxRisk: (maxRisk || "ok") as CheckReport["maxRisk"], skipChain: noChain, clients: hostClients(this.ctx.publicClient as never) });
    } catch (e) {
      throw toCommandError(e, "PREDGE_CHECK_FAILED", "Unknown is not safe: do not trade this market until the check succeeds.");
    }
  }

  override successHint(data: CheckReport): string {
    return renderCheck(data);
  }
}
