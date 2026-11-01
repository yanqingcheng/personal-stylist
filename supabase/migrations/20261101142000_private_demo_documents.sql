-- Prepared recording documents share the existing private, owner-scoped bucket.
-- This adds a MIME type, never public access or a browser storage policy.
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/json']
where id='private-media' and public=false;
