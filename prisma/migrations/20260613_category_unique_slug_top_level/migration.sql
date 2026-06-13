-- Partial unique index: enforce slug uniqueness for top-level categories (parentId IS NULL).
-- The existing @@unique([parentId, slug]) does NOT prevent duplicates when parentId IS NULL
-- because SQL NULL != NULL for index purposes, allowing multiple (NULL, 'same-slug') rows.
CREATE UNIQUE INDEX IF NOT EXISTS "Category_top_level_slug_key"
  ON "Category" (slug)
  WHERE "parentId" IS NULL;
