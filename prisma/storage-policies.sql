-- =====================================================
-- fixes/storage-policies.sql
-- Tenant-scoped storage. Run in the Supabase SQL editor.
-- PRE-REQ: uploaders now prefix paths with the businessId:
--   products/{businessId}/{uuid}.webp
--   logos/{businessId}/{uuid}.png
--   receipts/{businessId}/{uuid}.pdf
-- (one-line change in image-uploader.tsx, wizard.tsx, expense uploader:
--   const path = `${businessId}/${crypto.randomUUID()}.webp`)
-- =====================================================

-- Drop the over-broad Step 5/10 policies
drop policy if exists "Authenticated can upload product images" on storage.objects;
drop policy if exists "Authenticated can delete product images" on storage.objects;
drop policy if exists "Authenticated users can upload logos" on storage.objects;
drop policy if exists "Authenticated can upload receipts" on storage.objects;

-- Helper: is the current auth user a member of the business in the path?
create or replace function public.is_member_of(path_business text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.user_businesses ub
    where ub."userId" = auth.uid()
      and ub."businessId"::text = path_business
  );
$$;

-- S1 FIX: tenant-scoped write/delete on shared buckets.
-- (storage.foldername(name))[1] = first path segment = businessId
create policy "tenant upload products"
on storage.objects for insert to authenticated
with check (bucket_id = 'products' and public.is_member_of((storage.foldername(name))[1]));

create policy "tenant delete products"
on storage.objects for delete to authenticated
using (bucket_id = 'products' and public.is_member_of((storage.foldername(name))[1]));

create policy "tenant upload logos"
on storage.objects for insert to authenticated
with check (bucket_id = 'logos' and public.is_member_of((storage.foldername(name))[1]));

-- S2 FIX: receipts become PRIVATE (financial documents)
update storage.buckets set public = false where id = 'receipts';

create policy "tenant rw receipts"
on storage.objects for all to authenticated
using (bucket_id = 'receipts' and public.is_member_of((storage.foldername(name))[1]))
with check (bucket_id = 'receipts' and public.is_member_of((storage.foldername(name))[1]));

-- App change: expense receipt links now use signed URLs (server-side):
--   const { data } = await supabase.storage.from("receipts")
--     .createSignedUrl(path, 3600);

-- S6 FIX: server-enforced upload constraints (bypass-proof)
update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id in ('products','logos');
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
  where id = 'receipts';

-- =====================================================
-- S7 FIX — next.config.ts security headers (paste into next.config)
-- =====================================================
-- async headers() {
--   return [{
--     source: "/(.*)",
--     headers: [
--       { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
--       { key: "X-Content-Type-Options", value: "nosniff" },
--       { key: "X-Frame-Options", value: "DENY" },
--       { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
--       { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
--       { key: "Content-Security-Policy-Report-Only",
--         value: "default-src 'self'; img-src 'self' data: https://*.supabase.co; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://api.openai.com" },
--     ],
--   }];
-- }
-- Burn in Report-Only for a week, review violations, then enforce.
