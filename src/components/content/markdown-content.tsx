import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface MarkdownContentProps {
  /** Raw markdown string (e.g. a blog post or CMS page body). */
  children: string
  className?: string
}

/**
 * Renders markdown to React elements via react-markdown + GitHub-flavored
 * markdown (tables, strikethrough, task lists). Raw HTML in the source is
 * NOT rendered (no rehype-raw), so content is XSS-safe by default. The
 * `.blog-body` class supplies the prose styling from globals.css.
 */
export function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div className={cn("blog-body", className)}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  )
}
