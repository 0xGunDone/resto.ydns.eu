import { LucideIcon } from 'lucide-react';

export type MenuContext = 'global' | 'restaurant';

export interface MenuItem {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  requiredPermissions?: string[];
  requireRole?: string[];
  requireContext?: MenuContext;
  children?: MenuItem[];
  badge?: string | number;
  divider?: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  icon?: LucideIcon;
  items: MenuItem[];
  collapsible?: boolean;
  requireContext?: MenuContext;
}

export interface NavigationStructure {
  categories: MenuCategory[];
  context: MenuContext | null;
  selectedRestaurantId?: string | null;
}

