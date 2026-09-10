// ResourceCard (PLAN-002 E-006): полноценная товарная карточка ресурса.
// E-007: поле cover в backend пока отсутствует (задокументированный backend
// gap) — используется типографический cover с типом ресурса, без фейковых
// картинок.
import Link from "next/link";
import type { Resource } from "@/lib/api-ext";
import { Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { typeLabel } from "@/lib/domain";

const TYPE_ABBR: Record<string, string> = {
  SCRIPT: "SC",
  MAP: "MP",
  MODEL: "MD",
  TEXTURE: "TX",
  SOUND: "SN",
  GAMEMODE: "GM",
};

export function ResourceCard({ resource }: { resource: Resource }) {
  const abbr = TYPE_ABBR[resource.type] ?? resource.type.slice(0, 2).toUpperCase();

  return (
    <Link
      href={`/resources/${resource.slug}`}
      className="group block rounded-card border border-line bg-surface overflow-hidden transition-colors hover:border-line-strong hover:bg-surface-raised focus-visible:outline-none"
    >
      {/* Typographic cover: честная заглушка без фейковых изображений */}
      <div className="aspect-video bg-gradient-to-br from-accent-soft via-surface-raised to-surface flex items-center justify-center border-b border-line">
        <span className="text-3xl font-black tracking-widest text-accent/70 select-none">
          {abbr}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug group-hover:text-accent-strong transition-colors">
            {resource.title}
          </h3>
          <span className="flex-shrink-0 rounded bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong">
            {typeLabel(resource.type)}
          </span>
        </div>

        <p className="text-sm text-content-secondary line-clamp-2">{resource.description}</p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Price kopecks={resource.price} size="md" />
          <Rating value={resource.rating ?? null} count={resource.reviewCount ?? null} />
        </div>

        {resource.seller ? (
          <p className="text-xs text-content-muted truncate">
            Продавец:{" "}
            <span className="text-content-secondary">
              {resource.seller.displayName || resource.seller.username || "—"}
            </span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
