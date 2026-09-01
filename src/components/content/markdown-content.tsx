import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface MarkdownContentProps {
  /** Raw markdown string (e.g. a blog post or CMS page body). */
  children: string
  className?: string
  /**
   * GitHub-flavored markdown — tables, strikethrough, task lists, and
   * autolinked bare URLs. On by default.
   *
   * Set `false` for prose that *mentions* bare domains as text: legal and CMS
   * copy that repeats "www.example.com" would otherwise turn every mention
   * into a link. Explicit `[text](url)` links still work either way.
   */
  gfm?: boolean
}

/**
 * Renders markdown to React elements via react-markdown. Raw HTML in the source
 * is NOT rendered (no rehype-raw), so content is XSS-safe by default. The
 * `.blog-body` class supplies the prose styling from globals.css.
 */
export function MarkdownContent({
  children,
  className,
  gfm = true,
}: MarkdownContentProps) {
  return (
    <div className={cn("blog-body", className)}>
      <Markdown remarkPlugins={gfm ? [remarkGfm] : []}>{children}</Markdown>
    </div>
  )
}
