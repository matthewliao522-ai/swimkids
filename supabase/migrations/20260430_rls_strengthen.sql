-- =============================================
-- RLS 加強：教練場館限制
-- 2026-04-30
-- =============================================

-- Helper function: 檢查使用者是否為 admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_roles
    WHERE auth_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: 檢查使用者是否為 staff（admin 或 coach）
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_roles
    WHERE auth_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: 檢查使用者是否為考官
CREATE OR REPLACE FUNCTION is_exam_coach()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_roles sr
    JOIN coaches c ON c.id = sr.coach_id
    WHERE sr.auth_id = auth.uid() AND c.role = 'exam'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: 取得使用者可操作的場館 ID 列表
CREATE OR REPLACE FUNCTION my_venue_ids()
RETURNS SETOF UUID AS $$
  SELECT venue_id FROM coach_venues cv
  JOIN coaches c ON c.id = cv.coach_id
  JOIN staff_roles sr ON sr.coach_id = c.id
  WHERE sr.auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================
-- prep_classes RLS
-- =============================================
ALTER TABLE prep_classes ENABLE ROW LEVEL SECURITY;

-- 移除舊政策（如果存在）
DROP POLICY IF EXISTS "staff_all_prep_classes" ON prep_classes;
DROP POLICY IF EXISTS "coach_venue_prep_classes" ON prep_classes;

-- Admin 可操作所有
CREATE POLICY "admin_all_prep_classes" ON prep_classes
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 教練只能操作自己場館的班
CREATE POLICY "coach_venue_prep_classes" ON prep_classes
FOR ALL TO authenticated
USING (
  venue_id IN (SELECT my_venue_ids())
)
WITH CHECK (
  venue_id IN (SELECT my_venue_ids())
);

-- =============================================
-- prep_enrollments RLS
-- =============================================
ALTER TABLE prep_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_prep_enrollments" ON prep_enrollments;
DROP POLICY IF EXISTS "coach_venue_prep_enrollments" ON prep_enrollments;

-- Admin 可操作所有
CREATE POLICY "admin_all_prep_enrollments" ON prep_enrollments
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 教練只能操作自己場館班的學員
CREATE POLICY "coach_venue_prep_enrollments" ON prep_enrollments
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM prep_classes pc
    WHERE pc.id = prep_enrollments.prep_class_id
    AND pc.venue_id IN (SELECT my_venue_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM prep_classes pc
    WHERE pc.id = prep_enrollments.prep_class_id
    AND pc.venue_id IN (SELECT my_venue_ids())
  )
);

-- =============================================
-- exams RLS
-- =============================================
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_exams" ON exams;
DROP POLICY IF EXISTS "exam_coach_exams" ON exams;

-- Admin 可操作所有
CREATE POLICY "admin_all_exams" ON exams
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 考官可操作自己場館的考試
CREATE POLICY "exam_coach_venue_exams" ON exams
FOR ALL TO authenticated
USING (
  is_exam_coach() AND venue_id IN (SELECT my_venue_ids())
)
WITH CHECK (
  is_exam_coach() AND venue_id IN (SELECT my_venue_ids())
);

-- 家長只能看自己小孩的考試（唯讀）
CREATE POLICY "guardian_read_own_exams" ON exams
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM student_guardian sg
    JOIN guardians g ON g.id = sg.guardian_id
    WHERE g.auth_id = auth.uid() AND sg.student_id = exams.student_id
  )
);

-- =============================================
-- students RLS（加強）
-- =============================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_students" ON students;
DROP POLICY IF EXISTS "coach_venue_students" ON students;

-- Admin 可操作所有
CREATE POLICY "admin_all_students" ON students
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 教練可讀取自己場館的學員
CREATE POLICY "coach_read_venue_students" ON students
FOR SELECT TO authenticated
USING (
  is_staff() AND default_venue_id IN (SELECT my_venue_ids())
);

-- 教練可更新自己場館的學員（例如升級）
CREATE POLICY "coach_update_venue_students" ON students
FOR UPDATE TO authenticated
USING (
  is_staff() AND default_venue_id IN (SELECT my_venue_ids())
)
WITH CHECK (
  is_staff() AND default_venue_id IN (SELECT my_venue_ids())
);

-- 家長只能看自己的小孩
CREATE POLICY "guardian_read_own_students" ON students
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM student_guardian sg
    JOIN guardians g ON g.id = sg.guardian_id
    WHERE g.auth_id = auth.uid() AND sg.student_id = students.id
  )
);

-- =============================================
-- pending_notifications RLS
-- =============================================
ALTER TABLE pending_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_notifications" ON pending_notifications;

-- 只有 staff 可操作通知
CREATE POLICY "staff_all_notifications" ON pending_notifications
FOR ALL TO authenticated
USING (is_staff())
WITH CHECK (is_staff());
