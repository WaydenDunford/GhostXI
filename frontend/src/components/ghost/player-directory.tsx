import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ghostxi } from "@/lib/ghostxi-api";
import { Panel } from "./ui";
import { Input } from "@/components/ui/input";

export function PlayerDirectory() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const directory = useQuery({
    queryKey: ["ghostxi", "market", query],
    queryFn: () => ghostxi.getMarketPlayers({ search: query, limit: 20 }),
  });
  return (
    <Panel title="Player directory · Transfermarkt">
      <Input
        aria-label="Search player directory"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search verified player profiles…"
      />
      <p className="my-3 text-xs text-muted-foreground">
        {directory.data?.total.toLocaleString() ?? "…"} matching source profiles. Directory records
        require separate evidence to become simulation candidates.
      </p>
      {directory.error && <p role="alert">{directory.error.message}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {directory.data?.items.map((p) => (
          <div key={p.id} className="rounded-lg border bg-panel p-3">
            <p className="text-sm font-semibold">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {p.position} · {p.clubSnapshot.name}
            </p>
            <p className="mt-2 font-mono text-xs text-primary">
              {p.marketValue.valueEur === null
                ? "Value unavailable"
                : new Intl.NumberFormat("en", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 0,
                  }).format(p.marketValue.valueEur)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Valued {p.marketValue.date ?? "date unavailable"}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
