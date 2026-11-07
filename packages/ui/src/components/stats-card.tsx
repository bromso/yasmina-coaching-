import { cn } from "../lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "./card"
import { Icon } from "./icon"

interface StatsCardProps {
  label: string
  icon: string
  percentage: number
  type: "up" | "down"
  sign?: "money" | "number"
  stats: number
  profit: number
}

export function StatsCard({
  label,
  icon,
  type,
  sign = "number",
  stats,
  percentage,
  profit,
}: StatsCardProps) {
  return (
    <Card className="h-full w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <div className="bg-opacity-25 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600">
            <Icon icon={icon} className="text-indigo-400 h-3.5 w-3.5" />
          </div>
          <span>{label}</span>
        </CardTitle>
        <Icon icon="lucide:ellipsis-vertical" className="cursor-pointer opacity-60 h-4 w-4" />
      </CardHeader>
      <CardContent className="space-y-[10px] px-4 pt-0 pb-4">
        <p className="text-2xl font-bold">
          {sign === "money" && "$"}
          {stats.toLocaleString()}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn("flex items-center gap-1", {
              "text-emerald-400": type === "up",
              "text-red-400": type === "down",
            })}
          >
            {type === "up" ? (
              <Icon icon="lucide:arrow-up-right" className="h-4 w-4" />
            ) : (
              <Icon icon="lucide:arrow-down-right" className="h-4 w-4" />
            )}
            <p className="text-xs font-bold">{percentage.toLocaleString()}%</p>
          </div>
          <p className="text-muted-foreground text-xs font-normal">
            {type === "up" ? "+" : "-"}
            {profit.toLocaleString()} today
          </p>
        </div>
        <div className="bg-muted-foreground h-[0.04px] w-full opacity-50" />

        <div className="flex items-center gap-2">
          <p className="text-xs font-medium">View Report</p>
          <Icon icon="lucide:arrow-right" className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  )
}
