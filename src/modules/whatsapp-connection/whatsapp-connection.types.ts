export type WhatsAppPublicStatus = "connected" | "pending" | "error";

export type WhatsAppConnectionPublic = {
  ok: true;
  connected: boolean;
  status: WhatsAppPublicStatus;
  tenant_id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  business_id: string | null;
  display_phone_number: string | null;
  token_expires_at: string | null;
  last_error: string | null;
  updated_at: string | null;
  meta: {
    app_id: string;
    config_id: string;
  };
};

export type EmbeddedSignupCompleteResult = {
  ok: true;
  phone_number_id: string;
  waba_id: string;
  business_id: string | null;
  display_phone_number: string;
  status: "connected";
};
