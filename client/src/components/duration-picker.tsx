import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  Info,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DURATION_PRESETS } from "@shared/duration";

const PRESET_META: Record<number, { icon: LucideIcon; iconClass: string }> = {
  1: { icon: CalendarDays, iconClass: "text-red-500" },
  3: { icon: Calendar, iconClass: "text-blue-500" },
  12: { icon: CalendarCheck, iconClass: "text-green-600" },
};

type DurationPickerProps = {
  value: number;
  onChange: (value: number) => void;
};

export function DurationPicker({ value, onChange }: DurationPickerProps) {
  const isPresetValue = DURATION_PRESETS.some((p) => p.value === value);
  const [customMode, setCustomMode] = useState(!isPresetValue);
  const [customAmount, setCustomAmount] = useState(() => (isPresetValue ? 0 : value));
  const [unit, setUnit] = useState<"months" | "years">("months");
  const lastCustomValue = useRef<number | null>(null);

  const monthsFor = (amount: number, u: "months" | "years") =>
    u === "years" ? amount * 12 : amount;

  // If the value is changed externally (e.g. form reset) back to a preset,
  // leave custom mode unless that's the exact value the user typed.
  useEffect(() => {
    const preset = DURATION_PRESETS.some((p) => p.value === value);
    if (preset && customMode && lastCustomValue.current !== value) {
      setCustomMode(false);
    }
  }, [value, customMode]);

  const tileClass = (selected: boolean) =>
    cn(
      "relative flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium",
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "hover:border-muted-foreground/50 hover:bg-muted/50",
      selected &&
        "border-red-500 bg-red-50 dark:bg-red-950/30 hover:bg-red-50 dark:hover:bg-red-950/30"
    );

  return (
    <>
      <FormLabel className="flex items-center gap-1.5">
        Membership Duration *
        <Tooltip>
          <TooltipTrigger asChild>
            <Info
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label="Choose how long this membership lasts"
            />
          </TooltipTrigger>
          <TooltipContent>
            Choose how long this membership lasts
          </TooltipContent>
        </Tooltip>
      </FormLabel>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {DURATION_PRESETS.map((p) => {
          const selected = !customMode && value === p.value;
          const meta = PRESET_META[p.value];
          const Icon = meta?.icon ?? Calendar;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={selected}
              data-testid={`duration-tile-${p.value}`}
              onClick={() => {
                setCustomMode(false);
                lastCustomValue.current = null;
                onChange(p.value);
              }}
              className={tileClass(selected)}
            >
              <Icon className={cn("h-5 w-5", meta?.iconClass)} />
              <span>{p.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-pressed={customMode}
          data-testid="duration-tile-custom"
          onClick={() => {
            lastCustomValue.current = 0;
            setCustomAmount(0);
            setUnit("months");
            setCustomMode(true);
            onChange(0);
          }}
          className={tileClass(customMode)}
        >
          <SlidersHorizontal className="h-5 w-5 text-purple-500" />
          <span>Custom</span>
        </button>
      </div>

      {customMode && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            placeholder="e.g. 6"
            value={customAmount > 0 ? customAmount : ""}
            onChange={(e) => {
              const amount = e.target.value ? Math.max(1, parseInt(e.target.value)) : 0;
              const months = monthsFor(amount, unit);
              setCustomAmount(amount);
              lastCustomValue.current = months;
              onChange(months);
            }}
            className="w-24 h-9"
            data-testid="input-custom-duration"
          />
          <Select
            value={unit}
            onValueChange={(u) => {
              const next = u as "months" | "years";
              const months = monthsFor(customAmount, next);
              setUnit(next);
              lastCustomValue.current = months;
              onChange(months);
            }}
          >
            <SelectTrigger className="w-32 h-9" data-testid="select-duration-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="months">Months</SelectItem>
              <SelectItem value="years">Years</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <FormMessage />
    </>
  );
}
