import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/ui/page-header"
import { siteConfig } from "@/lib/config"
import { accountLinks, infoLinks } from "@/lib/navigation"
import { categoryRepository } from "@/lib/repositories"
import type { Category } from "@/types"

export const metadata: Metadata = {
  title: "Sitemap",
  description: `Browse the main sections of ${siteConfig.name}.`,
  alternates: { canonical: `${siteConfig.url}/sitemap` },
}

// The human-readable counterpart to app/sitemap.ts (which serves the XML for
// crawlers at /sitemap.xml). Footer "Sitemap" links point here.

const mainLinks = [
  { name: "Home", href: "/" },
  { name: "Shop All Products", href: "/shop" },
  { name: "All Brands", href: "/brands" },
  { name: "Search", href: "/search" },
  { name: "Cart", href: "/cart" },
]

const policyLinks = [
  { name: "Shipping Policy", href: "/policies/shipping" },
  { name: "Returns & Refunds", href: "/policies/returns" },
  { name: "Privacy Policy", href: "/policies/privacy" },
  { name: "Terms of Service", href: "/policies/terms" },
]

function LinkList({ links }: { links: { name: string; href: string }[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            {link.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  )
}

export default async function SitemapPage() {
  // Categories come from the repository layer so this page keeps working when
  // the catalog is swapped for a live PIM/CMS. A backend hiccup degrades to the
  // static sections rather than 500-ing the page.
  const categories: Category[] = await categoryRepository
    .list()
    .catch(() => [])

  const topLevel = categories
    .filter((category) => !category.parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))

  const childrenOf = (parentId: string) =>
    categories
      .filter((category) => category.parentId === parentId)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title="Sitemap"
        description="Every main section of the store in one place."
      />

      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Looking for the machine-readable version? Search engines can crawl the{" "}
        <a href="/sitemap.xml" className="underline hover:text-foreground">
          XML sitemap
        </a>
        .
      </p>

      <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <Section title="Main">
          <LinkList links={mainLinks} />
        </Section>
        <Section title="Information">
          <LinkList links={infoLinks} />
        </Section>
        <Section title="Your Account">
          <LinkList links={accountLinks} />
        </Section>
        <Section title="Policies">
          <LinkList links={policyLinks} />
        </Section>
      </div>

      {topLevel.length > 0 && (
        <div className="mt-14">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Shop by Category
          </h2>
          <div className="mt-3 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {topLevel.map((category) => {
              const children = childrenOf(category.id)
              return (
                <div key={category.id}>
                  <Link
                    href={`/${category.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {category.name}
                  </Link>
                  {children.length > 0 && (
                    <LinkList
                      links={children.map((child) => ({
                        name: child.name,
                        href: `/${child.slug}`,
                      }))}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
