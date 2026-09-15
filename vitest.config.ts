import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      WHATSAPP_VERIFY_TOKEN: "test_verify_token",
      WHATSAPP_GRAPH_VERSION: "v21.0",
      META_APP_ID: "test_app_id",
      META_APP_SECRET: "test_app_secret",
      META_SYSTEM_USER_ACCESS_TOKEN: "test_system_token",
      META_EMBEDDED_SIGNUP_CONFIG_ID: "test_config_id",
      OPENAI_API_KEY: "test_openai_key",
      OPENAI_MODEL: "gpt-4o-mini",
      ENCRYPTION_SECRET: "test_encryption_secret_at_least_32_chars_long_for_testing_purposes",
      INTERNAL_API_KEY: "test_internal_api_key",
      FAQ_SIMILARITY_THRESHOLD: "0.80",
      STORAGE_PATH: "./test-storage",
      DEFAULT_TIMEZONE: "America/Santiago"
    }
  }
});
