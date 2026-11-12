-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_at_idx" ON "ActivityLog"("at");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_id_idx" ON "ActivityLog"("actorId", "id");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_id_idx" ON "ActivityLog"("entityType", "entityId", "id");

-- The log is append-only. Rows may be inserted and read, never changed or
-- removed, whoever asks: the API has no route for it, and this refuses it at
-- the database as well.
CREATE FUNCTION "activity_log_is_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ActivityLog is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityLog_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "ActivityLog"
  FOR EACH ROW EXECUTE FUNCTION "activity_log_is_append_only"();

CREATE TRIGGER "ActivityLog_no_truncate"
  BEFORE TRUNCATE ON "ActivityLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "activity_log_is_append_only"();
