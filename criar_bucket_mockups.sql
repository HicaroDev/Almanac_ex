-- Criar bucket mockups (público)
INSERT INTO storage.buckets (id, name, public)
VALUES ('mockups', 'mockups', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: SELECT público
CREATE POLICY "Public SELECT"
ON storage.objects FOR SELECT
USING (bucket_id = 'mockups');

-- Policy: INSERT autenticado
CREATE POLICY "Authenticated INSERT"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'mockups'
  AND auth.role() = 'authenticated'
);

-- Policy: UPDATE autenticado (próprio arquivo)
CREATE POLICY "Authenticated UPDATE"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'mockups'
  AND auth.role() = 'authenticated'
);

-- Policy: DELETE autenticado (próprio arquivo)
CREATE POLICY "Authenticated DELETE"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'mockups'
  AND auth.role() = 'authenticated'
);
