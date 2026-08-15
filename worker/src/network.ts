import https from "node:https";

/**
 * Allow operators on hosts with broken IPv6 routing to force public RPC calls
 * over IPv4. The default keeps Node's normal address-family selection.
 */
export function configureRpcTransport(): void {
  if (process.env.LOOMCREDIT_FORCE_IPV4 === "true") {
    https.globalAgent.options.family = 4;
  }
}
