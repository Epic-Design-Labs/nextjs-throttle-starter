// Default repository implementations.
//   • Products / categories / brands — JSON-backed (src/data/*.json)
//   • Blog posts / CMS pages — markdown files (content/blog, content/pages)
// To swap a backend (database, CMS, API), implement the same interface
// and change the export here.

export { jsonProductRepository as productRepository } from "./json-product-repository"
export { jsonCategoryRepository as categoryRepository } from "./json-category-repository"
export { jsonBrandRepository as brandRepository } from "./json-brand-repository"
export { markdownPageRepository as pageRepository } from "./markdown-page-repository"
export { markdownBlogRepository as blogRepository } from "./markdown-blog-repository"
