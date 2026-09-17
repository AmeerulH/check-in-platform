update storage.buckets
set allowed_mime_types = array['image/png', 'text/plain']
where id = 'guest-passes';
