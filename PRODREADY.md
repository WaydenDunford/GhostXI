# ProdReady for GhostXI

ProdReady is configured in Codex's user settings, outside this repository, at
`https://mcp.prodready.si/mcp`. Official guide: <https://prodready.si/docs/>.

Verified on 12 November 2026: registration enabled, Codex OAuth login succeeded,
and Codex retrieved the ProdReady tool inventory (including `prodready_probe`,
`prodready_assess`, `prodready_dd_brief`, and `prodready_dd_assess`). No scan or
SDLC workflow was run. This verifies the current user's setup, not teammates'
authentication; each teammate signs in separately.

## Setup and verification

```sh
codex mcp get prodready
codex mcp list
# Only if the server is missing:
codex mcp add prodready --url https://mcp.prodready.si/mcp
# Complete sign-in and connection approval manually in the browser:
codex mcp login prodready
```

Sign-in emails come from `prodready@innovate.si`; check Gmail's Promotions tab
and Spam. Use the link in the browser where login began, or enter its code in
that browser. The sign-in page lasts 10 minutes; the email link/code lasts 15.
Keep all credentials in Codex's user credential store, never in this repository.
After login, verify that Codex can list ProdReady tools. If the current chat
does not expose them, reconnect the MCP server or start a new Codex session.
Registration alone does not prove authentication or tool access.

## Manual activation only

From a Codex session opened in this repository, say **Run ProdReady** or
**check my app** to authorize the free scan. Codex should use `prodready_probe`,
collect read-only local evidence, then call `prodready_assess`.

Run the 18-dimension due diligence review only when separately requested,
using `prodready_dd_brief` and `prodready_dd_assess`. Report findings by severity
with file and line references, identify checks that could not be evaluated,
and suggest fixes with critical issues first. Wait for explicit approval
before modifying code.

Setup does not authorize a scan, due diligence, SDLC activation, automatic
fixes/refactoring, dependency changes, background services, or continuous scans.
Never send source contents, secrets, or credentials as scan evidence.
