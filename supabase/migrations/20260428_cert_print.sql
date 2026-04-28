-- venues 補通知 email
ALTER TABLE venues ADD COLUMN IF NOT EXISTS notify_email TEXT;

-- guardians 補 LINE user ID
ALTER TABLE guardians ADD COLUMN IF NOT EXISTS line_user_id TEXT;

-- 印製申請表
CREATE TABLE IF NOT EXISTS cert_print_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES students(id),
  guardian_id  UUID        NOT NULL REFERENCES guardians(id),
  venue_id     UUID        NOT NULL REFERENCES venues(id),
  level        INTEGER     NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'done')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at  TIMESTAMPTZ
);

ALTER TABLE cert_print_requests ENABLE ROW LEVEL SECURITY;

-- 員工可查看所有申請
CREATE POLICY "staff_select_cert_requests"
  ON cert_print_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_roles WHERE auth_id = auth.uid()));

-- 員工可標記完成
CREATE POLICY "staff_update_cert_requests"
  ON cert_print_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_roles WHERE auth_id = auth.uid()));

-- 家長只能新增自己的申請
CREATE POLICY "guardian_insert_cert_request"
  ON cert_print_requests FOR INSERT TO authenticated
  WITH CHECK (guardian_id = (SELECT id FROM guardians WHERE auth_id = auth.uid()));

-- 家長只能查看自己的申請
CREATE POLICY "guardian_select_cert_requests"
  ON cert_print_requests FOR SELECT TO authenticated
  USING (guardian_id = (SELECT id FROM guardians WHERE auth_id = auth.uid()));
