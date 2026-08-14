
-- Soft-delete columns on lead_folders + leads
ALTER TABLE public.lead_folders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_lead_folders_deleted_at
  ON public.lead_folders(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at
  ON public.leads(deleted_at) WHERE deleted_at IS NOT NULL;

-- Rewrite SELECT policies on leads to hide soft-deleted from non-admins
DROP POLICY IF EXISTS "Agent reads assigned leads" ON public.leads;
CREATE POLICY "Agent reads assigned leads" ON public.leads
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'agent'::app_role)
         AND assigned_user_id = auth.uid()
         AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Office reads office leads" ON public.leads;
CREATE POLICY "Office reads office leads" ON public.leads
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'office'::app_role)
         AND office_id = get_user_office(auth.uid())
         AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Viewer reads leads" ON public.leads;
CREATE POLICY "Viewer reads leads" ON public.leads
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role) AND deleted_at IS NULL);

-- lead_folders
DROP POLICY IF EXISTS "Office reads folders" ON public.lead_folders;
CREATE POLICY "Office reads folders" ON public.lead_folders
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'office'::app_role) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Viewer reads lead_folders" ON public.lead_folders;
CREATE POLICY "Viewer reads lead_folders" ON public.lead_folders
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role) AND deleted_at IS NULL);

-- Creator policy: scope to non-deleted (admin retains via "Admin all folders")
DROP POLICY IF EXISTS "Creator manages own folders" ON public.lead_folders;
CREATE POLICY "Creator manages own folders" ON public.lead_folders
  FOR ALL TO authenticated
  USING (created_by = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (created_by = auth.uid());

-- lead_folder_items: hide rows whose folder is soft-deleted from non-admins
DROP POLICY IF EXISTS "Office reads folder items" ON public.lead_folder_items;
CREATE POLICY "Office reads folder items" ON public.lead_folder_items
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'office'::app_role)
         AND folder_id IN (SELECT id FROM public.lead_folders WHERE deleted_at IS NULL));

DROP POLICY IF EXISTS "Viewer reads lead_folder_items" ON public.lead_folder_items;
CREATE POLICY "Viewer reads lead_folder_items" ON public.lead_folder_items
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role)
         AND folder_id IN (SELECT id FROM public.lead_folders WHERE deleted_at IS NULL));

DROP POLICY IF EXISTS "Creator manages folder items" ON public.lead_folder_items;
CREATE POLICY "Creator manages folder items" ON public.lead_folder_items
  FOR ALL TO authenticated
  USING (folder_id IN (SELECT id FROM public.lead_folders
                        WHERE created_by = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (folder_id IN (SELECT id FROM public.lead_folders
                            WHERE created_by = auth.uid() AND deleted_at IS NULL));
