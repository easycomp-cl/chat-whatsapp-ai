type CustomerNameFields = {
  displayAlias?: string | null;
  name?: string | null;
  phoneNumber: string;
};

export function resolveCustomerDisplayName(customer: CustomerNameFields): string {
  const alias = customer.displayAlias?.trim();
  if (alias) {
    return alias;
  }
  const whatsappName = customer.name?.trim();
  if (whatsappName) {
    return whatsappName;
  }
  const phone = customer.phoneNumber.trim();
  if (phone) {
    return phone;
  }
  return "Sin nombre";
}
