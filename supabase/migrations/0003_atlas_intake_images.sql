update storage.buckets
set allowed_mime_types = array[
  'text/plain',
  'text/markdown',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]::text[]
where id = 'atlas-intake';
