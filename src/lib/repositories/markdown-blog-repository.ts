import "server-only"

import type {
  BlogPost,
  PaginatedResult,
  PaginationParams,
  ProductImage,
} from "@/types"
import { loadCollection, type MarkdownDoc } from "@/lib/content/markdown"

function toPost(doc: MarkdownDoc): BlogPost {
  const d = doc.data
  return {
    id: (d.id as string) ?? doc.slug,
    title: (d.title as string) ?? doc.slug,
    slug: doc.slug,
    excerpt: (d.excerpt as string) ?? "",
    body: doc.body,
    author: (d.author as string) ?? "",
    tags: (d.tags as string[]) ?? [],
    coverImage: d.coverImage as ProductImage | undefined,
    publishedAt: (d.publishedAt as string) ?? "",
    updatedAt: d.updatedAt as string | undefined,
  }
}

async function allPosts(): Promise<BlogPost[]> {
  const docs = await loadCollection("blog")
  return docs
    .map(toPost)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
}

function paginate<T>(items: T[], params?: PaginationParams): PaginatedResult<T> {
  const page = params?.page ?? 1
  const limit = params?.limit ?? 9
  const total = items.length
  const totalPages = Math.ceil(total / limit)
  const offset = (page - 1) * limit
  return {
    items: items.slice(offset, offset + limit),
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  }
}

export const markdownBlogRepository = {
  async list(params?: PaginationParams): Promise<PaginatedResult<BlogPost>> {
    return paginate(await allPosts(), params)
  },

  async getBySlug(slug: string): Promise<BlogPost | null> {
    return (await allPosts()).find((p) => p.slug === slug) ?? null
  },

  async getByTag(
    tag: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<BlogPost>> {
    const filtered = (await allPosts()).filter((p) => p.tags.includes(tag))
    return paginate(filtered, params)
  },
}
