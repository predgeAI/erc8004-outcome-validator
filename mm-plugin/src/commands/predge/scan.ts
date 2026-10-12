import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { renderScan, scan, type ScanReport } from "../../core/scan.js";
import { toCommandError } from "../../host.js";

const inputs = {
  address: {
    type: InputFieldType.Text,
    flag: "address",
    message: "Polymarket wallet (proxy wallet) address",
    required: true,
  },
  includeRedeemable: {
    type: InputFieldType.Boolean,
    flag: "include-redeemable",
    message: "Also check positions that are already redeemable",
    required: false,
    prompt: false,
    default: false,
  },
  max: {
    type: InputFieldType.Text,
    flag: "max",
    message: "Check at most this many positions, largest first (default 200)",
    required: false,
    prompt: false,
  },
} satisfies InputSchema;

export default class PredgeScan extends PluginCommand<ScanReport> {
  static override description =
    "Scan a Polymarket wallet's open positions and flag every one whose market is disputed or proposed but not final, from signed Predge records.";
  static override examples = [
    "<%= config.bin %> predge scan --address 0x614dc8d3542c12103d2c6a3553fd761e391d1546",
    "<%= config.bin %> predge scan --address 0x614dc8d3542c12103d2c6a3553fd761e391d1546 --json",
  ];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "predge:scan";

  async execute(io: CommandIO): Promise<ScanReport> {
    const { address, includeRedeemable, max } = await io.resolveInputs(inputs);
    try {
      return await scan(address, { includeRedeemable, max: max ? Number(max) : 200 });
    } catch (e) {
      throw toCommandError(e, "PREDGE_SCAN_FAILED", "Check the address (the Polymarket proxy wallet, not the signer EOA) and try again.");
    }
  }

  override successHint(data: ScanReport): string {
    return renderScan(data);
  }
}
