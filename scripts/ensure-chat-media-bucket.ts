import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketId = process.env.SUPABASE_CHAT_MEDIA_BUCKET ?? "chat-media";

if (!url || !serviceKey) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/opus",
  "audio/webm"
];

async function main() {
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`No se pudo listar buckets: ${listError.message}`);
  }

  const exists = buckets?.some((b) => b.id === bucketId || b.name === bucketId);
  if (exists) {
    console.log(`Bucket "${bucketId}" ya existe.`);
    return;
  }

  const { data, error } = await supabase.storage.createBucket(bucketId, {
    public: false,
    fileSizeLimit: 52428800,
    allowedMimeTypes
  });

  if (error) {
    throw new Error(`No se pudo crear bucket "${bucketId}": ${error.message}`);
  }

  console.log(`Bucket "${bucketId}" creado.`, data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
