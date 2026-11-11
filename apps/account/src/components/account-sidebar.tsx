"use client"

import { belowSiteHeader } from "@repo/ui/blocks/site-header-shell"
import { Icon } from "@repo/ui/components/icon"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/components/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/** `key` names the item's label under `account.nav`. */
const NAV_ITEMS = [
  { key: "home", href: "/", icon: "lucide:house" },
  { key: "notifications", href: "/notifications", icon: "lucide:bell" },
  { key: "personalInfo", href: "/personal-info", icon: "lucide:user-round" },
  { key: "dataPrivacy", href: "/data-privacy", icon: "lucide:shield" },
  { key: "security", href: "/security", icon: "lucide:lock" },
  { key: "workspace", href: "/workspace", icon: "lucide:users-round" },
  { key: "payments", href: "/payments", icon: "lucide:credit-card" },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AccountSidebar() {
  const pathname = usePathname()
  const t = useTranslations("account.nav")

  return (
    <Sidebar className={belowSiteHeader}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(pathname, item.href)}>
                  <Link href={item.href}>
                    <Icon icon={item.icon} aria-hidden />
                    <span>{t(item.key)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
