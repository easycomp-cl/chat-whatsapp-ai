export const STANDARD_TEMPLATE_PACK_KEY = "standard_v1";
export const STANDARD_TEMPLATE_LANGUAGE = "es";

export type TemplateParameterField = {
  component: "body" | "button";
  index: number;
  label: string;
  example: string;
};

export type StandardTemplateUrlButton = {
  text: string;
  url: string;
  example: string;
};

export type StandardTemplateDefinition = {
  name: string;
  language: string;
  category: "UTILITY" | "AUTHENTICATION";
  productUse: string;
  bodyPreview: string;
  bodyText?: string;
  bodyExamples?: string[];
  urlButton?: StandardTemplateUrlButton;
  authentication?: {
    codeExpirationMinutes: number;
  };
  allowCategoryChange: boolean;
  parameterFields: TemplateParameterField[];
};

export const STANDARD_TEMPLATE_PACK: StandardTemplateDefinition[] = [
  {
    name: "verificar_responsable_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "AUTHENTICATION",
    productUse: "OTP al WhatsApp personal del admin",
    bodyPreview: "Tu código de verificación es {{1}}. No lo compartas.",
    authentication: { codeExpirationMinutes: 10 },
    allowCategoryChange: false,
    parameterFields: [
      { component: "body", index: 1, label: "Código OTP", example: "123456" }
    ]
  },
  {
    name: "aviso_handoff_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    productUse: "Aviso al responsable: un cliente pidió atención humana",
    bodyPreview:
      "Hola {{1}}, un cliente de {{2}} espera un humano. Conversación: {{3}}",
    bodyText:
      "Hola {{1}}, un cliente de {{2}} espera un humano. Conversación: {{3}}",
    bodyExamples: ["María", "Panadería Aurora", "Israel G."],
    allowCategoryChange: false,
    parameterFields: [
      { component: "body", index: 1, label: "Nombre del responsable", example: "María" },
      { component: "body", index: 2, label: "Nombre del negocio", example: "Panadería Aurora" },
      { component: "body", index: 3, label: "Cliente o conversación", example: "Israel G." }
    ]
  },
  {
    name: "seguimiento_asesor_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    productUse: "Recontacto al cliente con ventana 24 h cerrada",
    bodyPreview:
      "Hola {{1}}, recibimos tu consulta en {{2}}. Un asesor te contactará pronto por este chat.",
    bodyText:
      "Hola {{1}}, recibimos tu consulta en {{2}}. Un asesor te contactará pronto por este chat.",
    bodyExamples: ["Camila", "Panadería Aurora"],
    allowCategoryChange: false,
    parameterFields: [
      { component: "body", index: 1, label: "Nombre del cliente", example: "Camila" },
      { component: "body", index: 2, label: "Nombre del negocio", example: "Panadería Aurora" }
    ]
  },
  {
    name: "pedido_actualizacion_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    productUse: "Estado de pedido (ventana cerrada o abierta)",
    bodyPreview: "Hola {{1}}, tu pedido {{2}} tiene el siguiente estado: {{3}}.",
    bodyText: "Hola {{1}}, tu pedido {{2}} tiene el siguiente estado: {{3}}.",
    bodyExamples: ["Juan", "#1042", "En preparación"],
    allowCategoryChange: false,
    parameterFields: [
      { component: "body", index: 1, label: "Nombre del cliente", example: "Juan" },
      { component: "body", index: 2, label: "Número de pedido", example: "#1042" },
      { component: "body", index: 3, label: "Estado", example: "En preparación" }
    ]
  },
  {
    name: "recordatorio_cita_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    productUse: "Recordatorio de cita",
    bodyPreview:
      "Hola {{1}}, te recordamos tu cita el {{2}} a las {{3}}. Si necesitas cambiarla, responde este chat.",
    bodyText:
      "Hola {{1}}, te recordamos tu cita el {{2}} a las {{3}}. Si necesitas cambiarla, responde este chat.",
    bodyExamples: ["Ana", "05/08/2026", "10:30"],
    allowCategoryChange: false,
    parameterFields: [
      { component: "body", index: 1, label: "Nombre del cliente", example: "Ana" },
      { component: "body", index: 2, label: "Fecha", example: "05/08/2026" },
      { component: "body", index: 3, label: "Hora", example: "10:30" }
    ]
  },
  {
    name: "reabrir_conversacion_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    productUse: "Reabrir chat de forma controlada cuando la ventana 24 h cerró",
    bodyPreview:
      "Hola {{1}}, te escribimos de {{2}} por tu consulta. ¿Sigues necesitando ayuda? Responde este chat y te atendemos.",
    bodyText:
      "Hola {{1}}, te escribimos de {{2}} por tu consulta. ¿Sigues necesitando ayuda? Responde este chat y te atendemos.",
    bodyExamples: ["Pedro", "Panadería Aurora"],
    allowCategoryChange: false,
    parameterFields: [
      { component: "body", index: 1, label: "Nombre del cliente", example: "Pedro" },
      { component: "body", index: 2, label: "Nombre del negocio", example: "Panadería Aurora" }
    ]
  },
  {
    name: "link_pago_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    productUse: "Enlace de pago de un pedido ya confirmado",
    bodyPreview: "Hola {{1}}, te enviamos el enlace de pago de tu pedido {{2}}.",
    bodyText:
      "Hola {{1}}, te enviamos el enlace de pago de tu pedido {{2}}. Completa el pago y responde este chat si necesitas ayuda.",
    bodyExamples: ["Juan", "#1042"],
    urlButton: {
      text: "Pagar",
      url: "https://chatbotmanager.easycomp.cl/pay/{{1}}",
      example: "pedido-1042"
    },
    allowCategoryChange: true,
    parameterFields: [
      { component: "body", index: 1, label: "Nombre del cliente", example: "Juan" },
      { component: "body", index: 2, label: "Número de pedido", example: "#1042" },
      { component: "button", index: 0, label: "Sufijo del enlace de pago", example: "pedido-1042" }
    ]
  },
  {
    name: "muestra_producto_es",
    language: STANDARD_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    productUse: "Detalle del producto que el cliente consultó",
    bodyPreview:
      "Hola {{1}}, te enviamos el detalle del producto {{2}} que consultaste: {{3}}.",
    bodyText:
      "Hola {{1}}, te enviamos el detalle del producto {{2}} que consultaste: {{3}}. Si tienes dudas, responde este chat.",
    bodyExamples: ["Camila", "Torta mil hojas", "8 porciones, $18.900"],
    allowCategoryChange: true,
    parameterFields: [
      { component: "body", index: 1, label: "Nombre del cliente", example: "Camila" },
      { component: "body", index: 2, label: "Nombre del producto", example: "Torta mil hojas" },
      { component: "body", index: 3, label: "Detalle (precio, talla, etc.)", example: "8 porciones, $18.900" }
    ]
  }
];

export function getStandardTemplate(name: string): StandardTemplateDefinition | undefined {
  return STANDARD_TEMPLATE_PACK.find((item) => item.name === name);
}

export function countBodyVariables(text: string): number {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return 0;
  return new Set(matches).size;
}

export function renderTemplateBody(text: string, parameters: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_full, rawIndex: string) => {
    const index = Number(rawIndex);
    return parameters[index - 1] ?? `{{${rawIndex}}}`;
  });
}

export function buildCreateTemplatePayload(
  definition: StandardTemplateDefinition
): Record<string, unknown> {
  if (definition.authentication) {
    return {
      name: definition.name,
      language: definition.language,
      category: definition.category,
      allow_category_change: definition.allowCategoryChange,
      components: [
        { type: "BODY", add_security_recommendation: true },
        {
          type: "FOOTER",
          code_expiration_minutes: definition.authentication.codeExpirationMinutes
        },
        {
          type: "BUTTONS",
          buttons: [{ type: "OTP", otp_type: "COPY_CODE" }]
        }
      ]
    };
  }

  const components: Record<string, unknown>[] = [
    {
      type: "BODY",
      text: definition.bodyText,
      example: {
        body_text: [definition.bodyExamples ?? []]
      }
    }
  ];

  if (definition.urlButton) {
    components.push({
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: definition.urlButton.text,
          url: definition.urlButton.url,
          example: [definition.urlButton.example]
        }
      ]
    });
  }

  return {
    name: definition.name,
    language: definition.language,
    category: definition.category,
    allow_category_change: definition.allowCategoryChange,
    components
  };
}

export type TemplateSendComponent = {
  type: string;
  sub_type?: string;
  index?: string;
  parameters: Array<{ type: "text"; text: string }>;
};

export function buildSendTemplateComponents(input: {
  definition?: StandardTemplateDefinition;
  bodyParameters: string[];
  buttonParameters?: string[];
}): TemplateSendComponent[] {
  const components: TemplateSendComponent[] = [];
  const isAuth = Boolean(input.definition?.authentication);

  if (input.bodyParameters.length > 0 || isAuth) {
    const texts = isAuth
      ? [input.bodyParameters[0] ?? ""]
      : input.bodyParameters;
    components.push({
      type: "body",
      parameters: texts.map((text) => ({ type: "text", text }))
    });
  }

  if (isAuth) {
    const code = input.bodyParameters[0] ?? "";
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }]
    });
    return components;
  }

  if (input.definition?.urlButton) {
    const suffix = input.buttonParameters?.[0] ?? input.definition.urlButton.example;
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: suffix }]
    });
  }

  return components;
}
