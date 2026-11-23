import {
  Briefcase, Building2, Car, Coffee, Coins, Fuel, Gift, GraduationCap, HeartPulse, Home, Landmark, MoreHorizontal,
  Percent, Phone, Plane, Receipt, Repeat, RotateCcw, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Tag, Ticket,
  TrainFront, TrendingUp, Utensils, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";

const ICONS: Record<string, LucideIcon> = {
  food: Utensils, groceries: ShoppingCart, "eating out": Utensils, "coffee & snacks": Coffee,
  transport: Car, "local travel": TrainFront, fuel: Fuel,
  travel: Plane, "flights & trains": Plane, hotels: Building2,
  housing: Home, rent: Home, utilities: Zap, maintenance: Wrench,
  bills: Receipt, "phone & internet": Phone, emis: Landmark, insurance: ShieldCheck,
  shopping: ShoppingBag, health: HeartPulse, entertainment: Ticket, subscriptions: Repeat,
  education: GraduationCap, "personal care": Sparkles, "gifts & donations": Gift, "gifts received": Gift,
  taxes: Percent, other: MoreHorizontal, "other income": MoreHorizontal,
  salary: Briefcase, freelance: Briefcase, interest: Coins, dividends: TrendingUp, refunds: RotateCcw,
};

/** Rounded tile with a category icon in the category's own colour. */
export function CatBadge({ name, color, size = "md", className }: { name?: string | null; color: string; size?: "sm" | "md"; className?: string }) {
  const Icon = (name && ICONS[name.toLowerCase()]) || Tag;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-md", size === "md" ? "h-8 w-8" : "h-6 w-6", className)}
      style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
    >
      <Icon className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
    </span>
  );
}
