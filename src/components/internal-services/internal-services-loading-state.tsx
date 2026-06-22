import { Skeleton } from "@/components/ui/skeleton";

type InternalServicesLoadingStateProps = {
  title?: string;
  showTabs?: boolean;
  detail?: boolean;
};

export function InternalServicesLoadingState({
  title = "Internal Services",
  showTabs = true,
  detail = false,
}: InternalServicesLoadingStateProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-2xl font-semibold text-slate-900">{title}</div>
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>

      {showTabs ? (
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-28 rounded-lg" />
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Skeleton className="mb-4 h-6 w-56" />
        <div className="space-y-3">
          {Array.from({ length: detail ? 8 : 5 }).map((_, index) => (
            <Skeleton
              key={index}
              className={index === 1 && detail ? "h-32 w-full" : "h-12 w-full"}
            />
          ))}
        </div>
      </div>

      {detail ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Skeleton className="mb-4 h-5 w-40" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Skeleton className="mb-4 h-5 w-36" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
