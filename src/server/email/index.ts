/** Modulo server `email` (P7): adattatore, template e outbox con reinvio. */
export * from "./sender";
export * from "./outbox";
export { accessEmail } from "./templates/accesso";
export { CustomerConfirmationSchema, customerConfirmationEmail, customerPdfFilename, type CustomerConfirmationData } from "./templates/conferma-cliente";
export { OfficeNotificationSchema, officeNotificationEmail, type OfficeNotificationData } from "./templates/notifica-ufficio";
export { escapeHtml, oneLine } from "./templates/shared";
