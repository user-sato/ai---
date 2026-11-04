-- CreateIndex
CREATE INDEX "Evidence_messageId_idx" ON "Evidence"("messageId");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
