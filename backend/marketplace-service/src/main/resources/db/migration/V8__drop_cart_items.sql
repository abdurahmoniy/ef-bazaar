-- Cart was scoped out of the marketplace domain — buyers negotiate via chat
-- rather than a shopping-cart checkout flow. Drop the unused table.
DROP TABLE IF EXISTS cart_items;
