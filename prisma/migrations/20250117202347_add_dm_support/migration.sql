-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'DEFAULT';

-- CreateTable
CREATE TABLE "_ChannelParticipants" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ChannelParticipants_AB_unique" ON "_ChannelParticipants"("A", "B");

-- CreateIndex
CREATE INDEX "_ChannelParticipants_B_index" ON "_ChannelParticipants"("B");

-- AddForeignKey
ALTER TABLE "_ChannelParticipants" ADD CONSTRAINT "_ChannelParticipants_A_fkey" FOREIGN KEY ("A") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ChannelParticipants" ADD CONSTRAINT "_ChannelParticipants_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
