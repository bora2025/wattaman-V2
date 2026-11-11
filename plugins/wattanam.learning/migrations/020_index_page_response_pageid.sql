-- wattanam-plugin-migration: 020_index_page_response_pageid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_learning_page_response_pageid_idx ON plugin_wattanam_learning_page_response ("pageId");
