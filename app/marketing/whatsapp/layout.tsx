import { marketingWhatsAppUiNotFound } from '@/lib/marketing-ui-hidden'

export default function MarketingWhatsAppLayout({ children }: { children: React.ReactNode }) {
  void children
  marketingWhatsAppUiNotFound()
}
