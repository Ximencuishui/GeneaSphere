CREATE TABLE IF NOT EXISTS search_posts (
    id BIGSERIAL PRIMARY KEY,
    origin_place VARCHAR(255) NOT NULL,
    xipai_keywords TEXT[],
    contact_info TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_posts_origin_place ON search_posts(origin_place);
CREATE INDEX IF NOT EXISTS idx_search_posts_xipai_keywords ON search_posts USING GIN(xipai_keywords);
