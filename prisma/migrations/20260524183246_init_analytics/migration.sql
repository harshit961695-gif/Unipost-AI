-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "total_reach" INTEGER NOT NULL DEFAULT 0,
    "total_impressions" INTEGER NOT NULL DEFAULT 0,
    "total_engagement" INTEGER NOT NULL DEFAULT 0,
    "total_views" INTEGER NOT NULL DEFAULT 0,
    "total_likes" INTEGER NOT NULL DEFAULT 0,
    "total_comments" INTEGER NOT NULL DEFAULT 0,
    "snapshot_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_post_id" TEXT NOT NULL,
    "content" TEXT,
    "media_url" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "engagement" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_user_id_idx" ON "analytics_snapshots"("user_id");

-- CreateIndex
CREATE INDEX "analytics_snapshots_platform_idx" ON "analytics_snapshots"("platform");

-- CreateIndex
CREATE INDEX "analytics_snapshots_snapshot_date_idx" ON "analytics_snapshots"("snapshot_date");

-- CreateIndex
CREATE INDEX "post_logs_user_id_idx" ON "post_logs"("user_id");

-- CreateIndex
CREATE INDEX "post_logs_platform_idx" ON "post_logs"("platform");

-- CreateIndex
CREATE INDEX "post_logs_platform_post_id_idx" ON "post_logs"("platform_post_id");
