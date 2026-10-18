import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Plain GET search form: works without JavaScript and keeps the query in the URL. */
export function SearchForm({ name = "q", defaultValue, placeholder, label, children }: { name?: string; defaultValue?: string; placeholder: string; label: string; children?: React.ReactNode }) {
  return (
    <form role="search" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input name={name} defaultValue={defaultValue} placeholder={placeholder} aria-label={label} className="h-9 pl-9" />
      </div>
      {children}
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
