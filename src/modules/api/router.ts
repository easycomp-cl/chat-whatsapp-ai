import { Router } from "express";
import { requireInternalApiKey } from "./auth.middleware.js";
import {
  createAgent,
  createBusiness,
  createFaq,
  createWhatsappAccount,
  deleteFaq,
  getBusiness,
  listBusinesses,
  listFaqs,
  patchAgent,
  patchBusinessSettings,
  patchFaq
} from "./businesses.controller.js";
import {
  getConversation,
  listConversations,
  listConversationsInbox,
  patchConversationMode
} from "./conversations.controller.js";
import { sendConversationMessage, resendOutboundMessage, editOutboundMessage } from "./messages.controller.js";
import { getCustomerProfile, patchCustomerProfileHandler } from "./customers.controller.js";
import {
  connectShopify,
  getShopifyIntegration,
  importCatalogCsv,
  importCatalogJson,
  listCatalogProducts,
  syncShopifyCatalog
} from "./catalog.controller.js";
import {
  createDeliveryCommune,
  createDeliveryRegion,
  deleteDeliveryCommune,
  deleteDeliveryRegion,
  listChileRegions,
  listDeliveryRegions,
  patchDeliveryCommune,
  patchDeliveryRegion,
  rebuildDeliveryIndex,
  seedDeliveryCommunes
} from "./delivery.controller.js";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  indexKnowledgeDocument,
  knowledgeUploadMiddleware,
  listKnowledgeDocuments,
  uploadKnowledgeDocument
} from "./knowledge.controller.js";
import {
  getMetricsDashboard,
  getMetricsQuestions,
  getMetricsSummary,
  getMetricsUsage
} from "./metrics.controller.js";
import {
  chatImportUploadMiddleware,
  deleteChatImport,
  getChatImport,
  getToneAnalysis,
  listChatImports,
  listFaqSuggestions,
  listImportedMessages,
  listPendingFaqSuggestions,
  resetAllChatImports,
  uploadChatImport
} from "../chat-analysis/controllers/chat-imports.controller.js";
import {
  approveFaqSuggestion,
  rejectFaqSuggestion,
  updateFaqSuggestion
} from "../chat-analysis/controllers/faq-suggestions.controller.js";
import {
  approveConsolidatedToneAnalysis,
  approveToneAnalysis,
  getConsolidatedToneAnalysis
} from "../chat-analysis/controllers/tone-analysis.controller.js";

export function createApiRouter() {
  const router = Router();
  router.use(requireInternalApiKey);

  router.get("/businesses", listBusinesses);
  router.post("/businesses", createBusiness);
  router.get("/businesses/:id", getBusiness);
  router.patch("/businesses/:id/settings", patchBusinessSettings);
  router.post("/businesses/:id/whatsapp-accounts", createWhatsappAccount);
  router.post("/businesses/:id/agents", createAgent);
  router.patch("/agents/:id", patchAgent);

  router.get("/businesses/:businessId/conversations/inbox", listConversationsInbox);
  router.get("/businesses/:businessId/conversations", listConversations);
  router.get("/conversations/:id", getConversation);
  router.patch("/conversations/:id/mode", patchConversationMode);
  router.post("/conversations/:id/messages", sendConversationMessage);
  router.post("/messages/:id/resend", resendOutboundMessage);
  router.patch("/messages/:id", editOutboundMessage);

  router.get("/businesses/:businessId/customers/:customerId", getCustomerProfile);
  router.patch("/businesses/:businessId/customers/:customerId", patchCustomerProfileHandler);

  router.get("/businesses/:businessId/faqs", listFaqs);
  router.post("/businesses/:businessId/faqs", createFaq);
  router.patch("/businesses/:businessId/faqs/:id", patchFaq);
  router.delete("/businesses/:businessId/faqs/:id", deleteFaq);

  router.get("/businesses/:businessId/knowledge-documents", listKnowledgeDocuments);
  router.get("/businesses/:businessId/knowledge-documents/:id", getKnowledgeDocument);
  router.post("/businesses/:businessId/knowledge-documents", createKnowledgeDocument);
  router.post(
    "/businesses/:businessId/knowledge-documents/upload",
    knowledgeUploadMiddleware,
    uploadKnowledgeDocument
  );
  router.post("/businesses/:businessId/knowledge-documents/:id/index", indexKnowledgeDocument);
  router.delete("/businesses/:businessId/knowledge-documents/:id", deleteKnowledgeDocument);

  router.get("/businesses/:businessId/catalog/products", listCatalogProducts);
  router.post("/businesses/:businessId/catalog/import/csv", importCatalogCsv);
  router.post("/businesses/:businessId/catalog/import/json", importCatalogJson);
  router.post("/businesses/:businessId/integrations/shopify", connectShopify);
  router.get("/businesses/:businessId/integrations/shopify", getShopifyIntegration);
  router.post("/businesses/:businessId/integrations/shopify/sync", syncShopifyCatalog);

  router.get("/businesses/:businessId/delivery/regions", listDeliveryRegions);
  router.get("/delivery/chile-regions", listChileRegions);
  router.post("/businesses/:businessId/delivery/regions", createDeliveryRegion);
  router.patch("/businesses/:businessId/delivery/regions/:id", patchDeliveryRegion);
  router.delete("/businesses/:businessId/delivery/regions/:id", deleteDeliveryRegion);
  router.post(
    "/businesses/:businessId/delivery/regions/:regionId/seed-communes",
    seedDeliveryCommunes
  );
  router.post(
    "/businesses/:businessId/delivery/regions/:regionId/communes",
    createDeliveryCommune
  );
  router.patch(
    "/businesses/:businessId/delivery/regions/:regionId/communes/:communeId",
    patchDeliveryCommune
  );
  router.delete(
    "/businesses/:businessId/delivery/regions/:regionId/communes/:communeId",
    deleteDeliveryCommune
  );
  router.post("/businesses/:businessId/delivery/reindex", rebuildDeliveryIndex);

  router.get("/businesses/:businessId/metrics/summary", getMetricsSummary);
  router.get("/businesses/:businessId/metrics/dashboard", getMetricsDashboard);
  router.get("/businesses/:businessId/metrics/questions", getMetricsQuestions);
  router.get("/businesses/:businessId/metrics/usage", getMetricsUsage);

  router.post(
    "/businesses/:businessId/chat-imports",
    chatImportUploadMiddleware,
    uploadChatImport
  );
  router.get("/businesses/:businessId/chat-imports", listChatImports);
  router.post("/businesses/:businessId/chat-imports/reset", resetAllChatImports);
  router.get("/businesses/:businessId/chat-imports/:importJobId", getChatImport);
  router.delete("/businesses/:businessId/chat-imports/:importJobId", deleteChatImport);
  router.get("/businesses/:businessId/faq-suggestions/pending", listPendingFaqSuggestions);
  router.get(
    "/businesses/:businessId/chat-imports/:importJobId/messages",
    listImportedMessages
  );
  router.get(
    "/businesses/:businessId/chat-imports/:importJobId/faq-suggestions",
    listFaqSuggestions
  );
  router.get(
    "/businesses/:businessId/chat-imports/:importJobId/tone-analysis",
    getToneAnalysis
  );

  router.patch("/businesses/:businessId/faq-suggestions/:suggestionId/approve", approveFaqSuggestion);
  router.patch("/businesses/:businessId/faq-suggestions/:suggestionId", updateFaqSuggestion);
  router.patch("/businesses/:businessId/faq-suggestions/:suggestionId/reject", rejectFaqSuggestion);

  router.get(
    "/businesses/:businessId/tone-analysis/consolidated",
    getConsolidatedToneAnalysis
  );
  router.patch(
    "/businesses/:businessId/tone-analysis/consolidated/approve",
    approveConsolidatedToneAnalysis
  );
  router.patch(
    "/businesses/:businessId/tone-analysis/:toneAnalysisId/approve",
    approveToneAnalysis
  );

  return router;
}
