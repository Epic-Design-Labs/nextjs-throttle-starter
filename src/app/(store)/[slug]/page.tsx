import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { productRepository, categoryRepository, brandRepository } from "@/lib/repositories"
import { ProductDetailView } from "./product-detail-view"
import { CategoryView } from "./category-view"
import { BrandView } from "./brand-view"
import {
  loadBrandListing,
  loadCategoryListing,
  resolveSlugKind,
} from "./listing"
import { formatPrice } from "@/lib/utils"
import { isUnpriced } from "@/lib/pricing"
import { siteConfig } from "@/lib/config"
import data from "@/data/products.json"

interface SlugPageProps {
  params: Promise<{ slug: string }>
}

// Only render slugs returned by generateStaticParams — any other slug
// automatically gets a proper 404 response. Rebuild/redeploy to pick
// up new products, categories, or brands.
//
// Flipping this to `true` (common when the catalog lives in a live PIM) turns
// unknown slugs into **soft-404s**: the route-level loading.tsx commits a 200
// before the resolver can call notFound(). Read
// docs/live-pim-dynamicparams.md first — the recipe is: verify existence in
// generateMetadata, and delete [slug]/loading.tsx.
export const dynamicParams = false

export async function generateStaticParams() {
  const productSlugs = data.products
    .filter((p) => p.status === "active")
    .map((p) => ({ slug: p.slug }))
  const categorySlugs = data.categories.map((c) => ({ slug: c.slug }))
  const brandSlugs = (data as { brands?: { slug: string }[] }).brands?.map(
    (b) => ({ slug: b.slug })
  ) ?? []

  return [...productSlugs, ...categorySlugs, ...brandSlugs]
}

export async function generateMetadata({
  params,
}: SlugPageProps): Promise<Metadata> {
  const { slug } = await params
  const kind = await resolveSlugKind(slug)

  const product =
    kind === "product" ? await productRepository.getBySlug(slug) : null
  if (product) {
    const variant = product.variants[0]
    const unpriced = isUnpriced(variant)
    const price = variant && !unpriced ? formatPrice(variant.price, variant.currency) : ""
    return {
      title: product.name,
      description: product.description,
      alternates: { canonical: `/${product.slug}` },
      openGraph: {
        title: product.name,
        description: product.description,
        type: "website",
        url: `${siteConfig.url}/${product.slug}`,
        images: product.images[0]
          ? [{ url: product.images[0].url, alt: product.images[0].alt }]
          : [],
      },
      // Omit the price tags entirely when there is no price. A
      // `product:price:amount` of 0 tells every scraper the item is free;
      // absent tags just mean "not stated".
      other: unpriced
        ? {}
        : {
            "product:price:amount": String(variant!.price / 100),
            "product:price:currency": variant!.currency,
          },
    }
  }

  const category =
    kind === "category" ? await categoryRepository.getBySlug(slug) : null
  if (category) {
    return {
      title: category.name,
      description: category.description,
      alternates: { canonical: `/${category.slug}` },
      openGraph: {
        title: category.name,
        description: category.description,
        type: "website",
        url: `${siteConfig.url}/${category.slug}`,
      },
    }
  }

  const brand =
    kind === "brand" ? await brandRepository.getBySlug(slug) : null
  if (brand) {
    return {
      title: brand.name,
      description: brand.description,
      alternates: { canonical: `/${brand.slug}` },
      openGraph: {
        title: brand.name,
        description: brand.description,
        type: "website",
        url: `${siteConfig.url}/${brand.slug}`,
      },
    }
  }

  return { title: "Not Found" }
}

export default async function SlugPage({ params }: SlugPageProps) {
  const { slug } = await params
  const kind = await resolveSlugKind(slug)

  // Check product first
  const product =
    kind === "product" ? await productRepository.getBySlug(slug) : null
  if (product) {
    // Pick the most specific category (prefer one with a parentId, i.e. a subcategory)
    const productCategories = await Promise.all(
      product.categoryIds.map((id) => categoryRepository.getById(id))
    )
    const validCategories = productCategories.filter(
      (c): c is NonNullable<typeof c> => c !== null
    )
    const primaryCategory =
      validCategories.find((c) => c.parentId) ?? validCategories[0] ?? null

    const [relatedProducts, brand, categoryAncestors] = await Promise.all([
      primaryCategory
        ? productRepository
            .getByCategory(primaryCategory.slug, { page: 1, limit: 5 })
            .then((r) => r.items.filter((p) => p.id !== product.id).slice(0, 4))
        : Promise.resolve([]),
      brandRepository.getById(product.brandId),
      primaryCategory
        ? categoryRepository.getAncestors(primaryCategory.id)
        : Promise.resolve([]),
    ])

    return (
      <ProductDetailView
        product={product}
        relatedProducts={relatedProducts}
        brand={brand}
        categoryAncestors={categoryAncestors}
      />
    )
  }

  // Category and brand listings are page 1. Pages 2..N are served by
  // ./page/[n]/page.tsx through the same loaders, so the two cannot drift.
  if (kind === "category") {
    const listing = await loadCategoryListing(slug, 1)
    if (listing) {
      return (
        <CategoryView
          category={listing.category}
          products={listing.products}
          pagination={listing.pagination}
          subcategories={listing.subcategories}
          ancestors={listing.ancestors}
        />
      )
    }
  }

  if (kind === "brand") {
    const listing = await loadBrandListing(slug, 1)
    if (listing) {
      return (
        <BrandView
          brand={listing.brand}
          products={listing.products}
          pagination={listing.pagination}
        />
      )
    }
  }

  notFound()
}
