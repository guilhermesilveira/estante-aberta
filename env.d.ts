declare namespace Cloudflare {
  interface Env {
    FILES: R2Bucket;
    VAPID_PUBLIC_KEY: string;
    VAPID_PRIVATE_KEY: string;
    VAPID_SUBJECT: string;
  }
}
