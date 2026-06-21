$schemaContent = @"
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(uuid()) @map("id")
  phone         String    @unique @map("phone")
  password_hash String    @map("password_hash")
  created_at    DateTime  @default(now()) @map("created_at")
  updated_at    DateTime  @updatedAt @map("updated_at")
  clans         Clan[]
  @@map("users")
}

model Clan {
  id            BigInt    @id @default(autoincrement()) @map("id")
  name          String    @map("name")
  description   String?   @map("description")
  admin_user_id String    @map("admin_user_id")
  settings_json Json?     @map("settings_json")
  created_at    DateTime  @default(now()) @map("created_at")
  updated_at    DateTime  @updatedAt @map("updated_at")
  admin_user    User      @relation(fields: [admin_user_id], references: [id], onDelete: Cascade)
  @@map("clans")
}
"@
Set-Content -Path "E:\GeneaSphere\packages\db\prisma\schema.prisma" -Value $schemaContent -Encoding UTF8