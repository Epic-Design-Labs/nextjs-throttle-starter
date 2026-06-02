import "server-only"

import type { CmsPage } from "@/types"
import { loadCollection, type MarkdownDoc } from "@/lib/content/markdown"

function toPage(doc: MarkdownDoc): CmsPage {
  const d = doc.data
  return {
    id: (d.id as string) ?? doc.slug,
    title: (d.title as string) ?? doc.slug,
    slug: doc.slug,
    excerpt: d.excerpt as string | undefined,
    body: doc.body,
    publishedAt: (d.publishedAt as string) ?? "",
    updatedAt: d.updatedAt as string | undefined,
  }
}

async function allPages(): Promise<CmsPage[]> {
  const docs = await loadCollection("pages")
  return docs
    .map(toPage)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
}

export const markdownPageRepository = {
  async list(): Promise<CmsPage[]> {
    return allPages()
  },

  async getBySlug(slug: string): Promise<CmsPage | null> {
    return (await allPages()).find((p) => p.slug === slug) ?? null
  },

  async getById(id: string): Promise<CmsPage | null> {
    return (await allPages()).find((p) => p.id === id) ?? null
  },
}
