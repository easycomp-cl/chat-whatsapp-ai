import { logger } from "../../lib/logger.js";
import { connectionError, WhatsAppConnectionError } from "../whatsapp-connection/whatsapp-connection.errors.js";

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
  };
};

type OAuthTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

export type ExchangedToken = {
  accessToken: string;
  expiresIn?: number;
  tokenType?: string;
};

export type PhoneNumberDetails = {
  id: string;
  displayPhoneNumber: string;
  verifiedName?: string;
};

export type WabaDetails = {
  id: string;
  name?: string;
  businessId?: string;
};

export type MetaGraphClientConfig = {
  graphVersion: string;
  appId: string;
  appSecret: string;
  redirectUri?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function mapOAuthGraphError(status: number, body: GraphErrorBody): WhatsAppConnectionError {
  const message = (body.error?.error_user_msg ?? body.error?.message ?? "").toLowerCase();
  const code = body.error?.code;

  if (
    message.includes("expired") ||
    message.includes("expirado") ||
    code === 100 && message.includes("verification code") && message.includes("expired")
  ) {
    return connectionError(
      "code_expired",
      "El código de autorización expiró. Vuelve a conectar WhatsApp desde el panel.",
      400
    );
  }

  if (
    message.includes("already been used") ||
    message.includes("code has been used") ||
    message.includes("authorization code has been used")
  ) {
    return connectionError(
      "code_reused",
      "Ese código de autorización ya fue usado. Vuelve a conectar WhatsApp para obtener uno nuevo.",
      409
    );
  }

  if (
    message.includes("redirect_uri") ||
    message.includes("redirect uri")
  ) {
    return connectionError(
      "invalid_redirect_uri",
      "Meta rechazó el redirect_uri del intercambio OAuth. El code de FB.login (Embedded Signup) no debe enviarse con redirect_uri.",
      400
    );
  }

  if (status === 400 || code === 100 || code === 190) {
    return connectionError(
      "invalid_code",
      "El código de autorización no es válido o ya no se puede usar. Vuelve a conectar WhatsApp.",
      400
    );
  }

  return connectionError(
    "meta_graph_error",
    "No se pudo completar la conexión con Meta. Inténtalo de nuevo en unos minutos.",
    status >= 500 ? 502 : 400
  );
}

export class MetaGraphClient {
  constructor(private readonly config: MetaGraphClientConfig) {}

  private graphUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `https://graph.facebook.com/${this.config.graphVersion}${normalized}`;
  }

  async exchangeCodeForToken(code: string): Promise<ExchangedToken> {
    // FB.login Embedded Signup (response_type=code) emite un code que Graph
    // rechaza si se manda redirect_uri. El redirect OAuth sí lo necesita.
    // Probar sin URI primero; si Meta pide coincidencia, reintentar con la configurada.
    const redirectCandidates: Array<string | undefined> = [undefined];
    if (this.config.redirectUri) {
      redirectCandidates.push(this.config.redirectUri);
    }

    let lastRedirectError: WhatsAppConnectionError | undefined;
    for (let i = 0; i < redirectCandidates.length; i++) {
      const redirectUri = redirectCandidates[i];
      try {
        const token = await this.exchangeCodeForTokenOnce(code, redirectUri);
        if (i > 0) {
          logger.info(
            { usedRedirectUri: Boolean(redirectUri) },
            "OAuth token exchange succeeded after retrying redirect_uri"
          );
        }
        return token;
      } catch (error) {
        const canRetry =
          error instanceof WhatsAppConnectionError &&
          error.code === "invalid_redirect_uri" &&
          i < redirectCandidates.length - 1;
        if (!canRetry) {
          throw error;
        }
        lastRedirectError = error;
        logger.warn(
          { hadRedirectUri: Boolean(redirectUri) },
          "OAuth token exchange rejected redirect_uri; retrying with the configured URI"
        );
      }
    }

    throw (
      lastRedirectError ??
      connectionError(
        "invalid_redirect_uri",
        "Meta rechazó el redirect_uri del intercambio OAuth. El code de FB.login (Embedded Signup) no debe enviarse con redirect_uri.",
        400
      )
    );
  }

  private async exchangeCodeForTokenOnce(
    code: string,
    redirectUri: string | undefined
  ): Promise<ExchangedToken> {
    const url = new URL(this.graphUrl("/oauth/access_token"));
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("code", code);
    if (redirectUri) {
      url.searchParams.set("redirect_uri", redirectUri);
    }

    const response = await fetch(url, { method: "GET" });
    const json = (await response.json().catch(() => ({}))) as OAuthTokenResponse & GraphErrorBody;

    if (!response.ok || !json.access_token) {
      throw mapOAuthGraphError(response.status, json);
    }

    return {
      accessToken: json.access_token,
      ...(typeof json.expires_in === "number" ? { expiresIn: json.expires_in } : {}),
      ...(json.token_type ? { tokenType: json.token_type } : {})
    };
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<ExchangedToken | null> {
    const url = new URL(this.graphUrl("/oauth/access_token"));
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("fb_exchange_token", shortLivedToken);

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return null;
    }

    const json = (await response.json().catch(() => ({}))) as OAuthTokenResponse;
    if (!json.access_token) {
      return null;
    }

    return {
      accessToken: json.access_token,
      ...(typeof json.expires_in === "number" ? { expiresIn: json.expires_in } : {}),
      ...(json.token_type ? { tokenType: json.token_type } : {})
    };
  }

  async subscribeWaba(wabaId: string, accessToken: string): Promise<void> {
    const response = await fetch(this.graphUrl(`/${wabaId}/subscribed_apps`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (response.ok) {
      return;
    }

    await response.json().catch(() => ({}));
    throw connectionError(
      "subscription_failed",
      "No se pudo suscribir el WABA al webhook de la app. Reintenta la conexión.",
      502
    );
  }

  async getPhoneNumber(phoneNumberId: string, accessToken: string): Promise<PhoneNumberDetails> {
    const url = new URL(this.graphUrl(`/${phoneNumberId}`));
    url.searchParams.set("fields", "id,display_phone_number,verified_name");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json = (await response.json().catch(() => ({}))) as GraphErrorBody & {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
    };

    if (!response.ok || !json.id) {
      throw connectionError(
        "phone_lookup_failed",
        "No se pudo leer el número de WhatsApp en Meta. Verifica phone_number_id y vuelve a conectar.",
        400
      );
    }

    return {
      id: json.id,
      displayPhoneNumber: json.display_phone_number ?? "",
      ...(json.verified_name ? { verifiedName: json.verified_name } : {})
    };
  }

  async getWaba(wabaId: string, accessToken: string): Promise<WabaDetails> {
    const url = new URL(this.graphUrl(`/${wabaId}`));
    url.searchParams.set("fields", "id,name,owner_business_info,on_behalf_of_business_info");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json = (await response.json().catch(() => ({}))) as GraphErrorBody & {
      id?: string;
      name?: string;
      owner_business_info?: unknown;
      on_behalf_of_business_info?: unknown;
    };

    if (!response.ok || !json.id) {
      throw connectionError(
        "waba_lookup_failed",
        "No se pudo leer el WABA en Meta. Verifica waba_id y vuelve a conectar.",
        400
      );
    }

    const owner = asRecord(json.owner_business_info);
    const onBehalf = asRecord(json.on_behalf_of_business_info);
    const businessId =
      (typeof owner.id === "string" && owner.id) ||
      (typeof onBehalf.id === "string" && onBehalf.id) ||
      undefined;

    return {
      id: json.id,
      ...(json.name ? { name: json.name } : {}),
      ...(businessId ? { businessId } : {})
    };
  }
}
