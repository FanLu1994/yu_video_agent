import { REMOTION_BEST_PRACTICES } from "@/constants/remotion-best-practices";

export function RemotionBestPracticesPanel() {
  return (
    <div className="space-y-3 py-1">
      {REMOTION_BEST_PRACTICES.map((section) => (
        <article
          className="rounded-lg border border-border/70 bg-muted/25 p-3"
          key={section.title}
        >
          <h3 className="font-medium text-sm">{section.title}</h3>
          <div className="mt-2 space-y-1.5">
            {section.details.map((item) => (
              <p className="text-muted-foreground text-xs leading-relaxed" key={item}>
                {item}
              </p>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
