<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- GhostXI mock data lives in src/lib/mock-data.ts; pages read only from it so real data sources can replace those exports later.
- Dark theme is the :root default; light theme is the `.light` class on <html> (toggled in Settings).
- Multi-sport layer: all sport-specific behavior (terminology, clocks, surfaces, data sources) lives in src/lib/sports.ts; per-sport datasets in src/lib/sport-data.ts (football wraps mock-data, other sports are labeled demo fixtures). Pages read the active dataset via useSport() from src/lib/sport-context.tsx — never import mock-data directly in pages.
- Match Lab shows only verified historical matches; unverified real-match scenarios (e.g. the removed Bosnia–Poland lab) must not appear in the UI. Why: user requires authentic data over fictional demos.
- Real-match data comes only from the external GhostXI backend via src/lib/match-catalog.ts (base URL VITE_GHOSTXI_API_URL); with no backend show an empty state, never synthetic data labeled as real. Why: authenticity requirement.
