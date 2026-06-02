import "server-only"

import { promises as fs } from "node:fs"
import path from "node:path"
import matter from "gray-matter"

// Content lives as markdown files under /content/<collection>/<slug>.md.
// The filename (without .md) is the slug; frontmatter holds the metadata;
// the markdown body is rendered with <MarkdownContent /> (react-markdown).
const CONTENT_ROOT = path.join(process.cwd(), "content")

export interface MarkdownDoc {
  /** Filename without `.md` — the URL slug. */
  slug: string
  /** Raw markdown body (frontmatter stripped). */
  body: string
  /** Parsed YAML frontmatter. */
  data: Record<string, unknown>
}

/**
 * Read every `.md` file in a content collection (e.g. "blog", "pages").
 * Files are read fresh on each call — the collections are small, and it
 * keeps dev edits visible without a restart. Missing folders return [].
 */
export async function loadCollection(collection: string): Promise<MarkdownDoc[]> {
  const dir = path.join(CONTENT_ROOT, collection)
  let files: string[]
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"))
  } catch {
    return []
  }
  return Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(dir, file), "utf8")
      const { data, content } = matter(raw)
      return {
        slug: file.replace(/\.md$/, ""),
        body: content.trim(),
        data: data as Record<string, unknown>,
      }
    })
  )
}
